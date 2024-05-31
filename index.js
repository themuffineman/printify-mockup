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
            headless: true,
        })
        console.log('Puppeterr is up and running')

        page = await browser.newPage()
        page.setDefaultNavigationTimeout(900000)
        page.setDefaultTimeout(900000)
        await page.setViewport({ width: 1336, height: 800 });
        await page.goto('https://printify.com/app/editor/77/99')
        console.log('Page Navigated')

        const ghostBtn = await page.waitForSelector('pfy-button[data-testid="closeButton"][data-analyticsid="onboardingIntroExploreByMyselfBtn"]')
        console.log('First Ghost Btn Appeared')
        await ghostBtn.click()

        const ghostBtn2 = await page.waitForSelector('pfy-button[data-testid="confirmButton"][data-analyticsid="onboardingOutroGotItBtn"]')
        console.log('Second Ghost Btn Appeared')
        await ghostBtn2.click()
        // try {

        // } catch (error) {
        //     console.log('Ghost Buttons Didnt Appear')
        // }

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
        console.log('Ctrl+] Button Clicked')
        // await new Promise(resolve => setTimeout(resolve, 30000))

        //preview section confirmation
        await page.waitForSelector('pfd-preview-sidebar')
        // await page.waitForSelector('ul[_ngcontent-ng-c2591322821][pfddrawerinitialelement].grid.ink-grid.ng-star-inserted')
        console.log('Now Previewing the Mockups')
        await new Promise(resolve => setTimeout(resolve, 20000))
        

        const mockupSelectors = [
            '#appShell > div.content-container > pfa-designer > pfa-designer-loader > designer-root > pfd-component-lazy-loader > pfd-preview-layout > div > div > div.sidebar > pfd-preview-sidebar > div.preview-content > pfd-preview-view-selector > ul > li:nth-child(1)',
            '#appShell > div.content-container > pfa-designer > pfa-designer-loader > designer-root > pfd-component-lazy-loader > pfd-preview-layout > div > div > div.sidebar > pfd-preview-sidebar > div.preview-content > pfd-preview-view-selector > ul > li:nth-child(4)',
            '#appShell > div.content-container > pfa-designer > pfa-designer-loader > designer-root > pfd-component-lazy-loader > pfd-preview-layout > div > div > div.sidebar > pfd-preview-sidebar > div.preview-content > pfd-preview-view-selector > ul > li:nth-child(6)',
            '#appShell > div.content-container > pfa-designer > pfa-designer-loader > designer-root > pfd-component-lazy-loader > pfd-preview-layout > div > div > div.sidebar > pfd-preview-sidebar > div.preview-content > pfd-preview-view-selector > ul > li:nth-child(7)'

        ];
        
        const mockupImages = []
        for (const selector of mockupSelectors) {
            await page.click(selector)
            console.log('Clicked the image selector')
            await new Promise(resolve => setTimeout(resolve, 5000))
            const blobUrl = await page.$eval('#appShell > div.content-container > pfa-designer > pfa-designer-loader > designer-root > pfd-component-lazy-loader > pfd-preview-layout > div > div > div.content > pfd-preview-main > div > img', img => img.src)
            console.log("Here's the url", blobUrl)

            const base64Image = await page.evaluate(async (blobUrl) => {
                const response = await fetch(blobUrl);
                const blob = await response.blob();
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result.split(',')[1]); // Remove the "data:..." prefix
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                });
            }, blobUrl)
            mockupImages.push(base64Image)
        }

        return res.json({images: mockupImages}).status(200)
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
async function downloadImage(url) {
    try {
        let blob;

        if (url.startsWith('blob:')) {
            // Handle blob URLs
            blob = await fetch(url).then(response => response.blob());
        } else {
            // Handle regular URLs
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error('Error Fetching Image');
            }
            blob = await response.blob();
        }

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                console.log('The string is this long:', reader.result.length);
                resolve(reader.result);
            };
            reader.onerror = (error) => {
                reject(new Error(`Error reading blob as data URL: ${error}`));
            };
            reader.readAsDataURL(blob);
        });
    } catch (error) {
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
