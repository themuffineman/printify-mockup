import express, { response } from 'express'
import cors from 'cors'
import puppeteer from 'puppeteer'
import bodyParser from 'body-parser'
import path from 'path'
import fs, { createWriteStream } from 'fs'
import {fileTypeFromBuffer} from 'file-type'
import { fileURLToPath } from 'url'
import imageDownloader from 'image-downloader'
import download from 'image-downloader'
import axios from 'axios'


const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PORT = 8080
const app = express()
app.listen(PORT, ()=> {
    console.log('Server up on port:', PORT)
})
app.use(
    cors({
        origin: '*'
    })
)
app.use(bodyParser.json({
    limit:'50mb'
}))

app.post('/get-mockup', async (req,res)=>{
    let browser;
    let page;
    let filename = 'image.png'
    try {
        console.log('Received Request')
        const {url} = req.body
        console.log('Received Url', url)
        const modifiedUrl = modifyUrl(url)
        console.log('Modified Url', modifiedUrl)
        await downloadImageToFile(modifiedUrl)

        browser = await puppeteer.launch({
            timeout: 120000,
            protocolTimeout: 600000,
            headless: false,
        })

        page = await browser.newPage()
        page.setDefaultNavigationTimeout(900000)
        page.setDefaultTimeout(900000)
        await page.goto('https://printify.com/app/editor/77/99')
        console.log('Page Navigated')
        const activateUpload = await page.waitForSelector('button[data-testid="leftBarOption"][data-analyticsid="newUploadOption"]')
        console.log('Upload Button Visisble')
        await activateUpload.click()
        console.log('Activate Upload Button Clicked!')
        await page.waitForSelector('button[data-testid="addMyDeviceLayerButton"][data-analyticsid="addMyDeviceLayerButton"]');
        console.log('Actual Upload Button Visible')

        //upload files
        const [designFileChooser] = await Promise.all([
            page.waitForFileChooser(),
            page.click('button[data-testid="addMyDeviceLayerButton"][data-analyticsid="addMyDeviceLayerButton"]')
        ])
        await designFileChooser.accept(['image.png'])
        console.log('Uploading File...')

        await page.waitForSelector('button[data-testid="chipButton"].chip.body-text.inverted.selected.selectable[type="button"]')
        console.log('File Uploaded Successfully')       
        
        //Click ctrl+] to preview mockups
        await page.keyboard.down('Control');
        await page.keyboard.press(']');
        await page.keyboard.up('Control');
        console.log('Button Clicked')

        //preview section confirmation
        await page.waitForSelector('button[data-testid="button"].button.secondary.medium[type="button"]')
        await page.waitForSelector('ul[_ngcontent-ng-c2591322821][pfddrawerinitialelement].grid.ink-grid.ng-star-inserted')
        console.log('Now Previewing the Mockups')

        const mockupSelectors = [
            'ul[_ngcontent-ng-c2591322821][pfddrawerinitialelement].grid.ink-grid.ng-star-inserted > li:nth-child(1)',
            'ul[_ngcontent-ng-c2591322821][pfddrawerinitialelement].grid.ink-grid.ng-star-inserted > li:nth-child(4)',
            'ul[_ngcontent-ng-c2591322821][pfddrawerinitialelement].grid.ink-grid.ng-star-inserted > li:nth-child(6)',
            'ul[_ngcontent-ng-c2591322821][pfddrawerinitialelement].grid.ink-grid.ng-star-inserted > li:nth-child(7)'
        ];
        
        const mockupImages = []
        for (const selector of mockupSelectors) {
            await page.click(selector)
            console.log('Clicked the image selector')
            await new Promise(resolve => setTimeout(resolve, 30000))
            const src = await page.$eval('img[data-testid="image"].image.ng-star-inserted', img => img.src)
            console.log("Here's the url", src)
            const base64File = await downloadImage(src)
            mockupImages.push(base64File)
        }

        return res.json({images: mockupImages})
    } catch (error) {
        console.error(error)
        return res.status(500).send("Error occured, oopsie daisy")
    }finally {
        if (browser) {
            await browser.close();
        }
        fs.unlink('./image.png', (err) => {
            if (err) {
              // Handle specific error if any
              if (err.code === 'ENOENT') {
                console.error('File does not exist.');
              } else {
                throw err;
              }
            } else {
              console.log('File deleted!');
            }
        });
    }
})

function modifyUrl(url){
    let newUrl

    if (url.startsWith('//')) {
        newUrl = 'https:' + url;  
    }else if (!url.startsWith('http://') && !url.startsWith('https://')) {
        newUrl = 'https://' + url; 
    }else{
        newUrl = url
    }

    return newUrl
}
async function downloadImage(url){
    try {
      const response = await fetch(url);
      if(!response){throw new Error('Error Fetching Image')}
      const blob = await response.blob() 

      const readerInstance = new FileReader()
      readerInstance.readAsDataURL(blob)
      readerInstance.onload = (e) =>{
        console.log('the string is this long', e.target.result.length)
        return e.target.result
      }

    } catch (error){
      console.error(`Error downloading image: ${error}`);
      return null;
    }
}
async function downloadImageToFile(url){
    const imagePath = 'image.png'
    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream'
    });

    const writer = fs.createWriteStream(imagePath);

    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}
