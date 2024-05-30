import express from 'express'
import cors from 'cors'
import puppeteer from 'puppeteer'
import bodyParser from 'body-parser'
import path from 'path'
import fs from 'fs'
import fileType from 'file-type'

const PORT = 8080
const app = express()
app.listen(PORT, ()=> {
    console.log('Server Up on port:', PORT)
})
app.use(
    cors({
        origin: '*'
    })
)``
app.use(bodyParser.json({
    limit:'50mb'
}))

app.post('get-mockup', async (req,res)=>{
    let browser;
    let page;
    let filename;
    try {
        console.log('Received Request')
        const {url} = req.body
        console.log('Received Url', url)
        const modifiedUrl = modifyUrl(url)
        console.log('Modified Url', modifiedUrl)
        
        const base64Src = await downloadImage(modifiedUrl)
        if(!base64Src){
            throw new Error('Error downloading image')
        }

        const isFileCreated = await createFileFromBase64(base64Src)
        if(isFileCreated.success){
            filename = isFileCreated.path
            console.log("Here's the path", isFileCreated.path)
        }else{
            throw new Error('Error Creating File')
        }

        browser = await puppeteer.launch({
            timeout: 120000,
            protocolTimeout: 600000,
            headless: true,
        })

        page = await browser.newPage()
        await page._client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir });
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
        const [psdFileChooser] = await Promise.all([
            page.waitForFileChooser(),
            page.click('button[data-testid="addMyDeviceLayerButton"][data-analyticsid="addMyDeviceLayerButton"]')
        ])

        //uploading design files
        await psdFileChooser.accept([isDownloaded.filename])
        console.log('Uploading File...')
        await page.waitForSelector('button[data-testid="chipButton"].chip.body-text.inverted.selected.selectable[type="button"]')
        console.log('File Uploaded Successfully')       
        
        //Click ctrl+] to preview mockups
        await page.keyboard.down('Control');
        await page.keyboard.press(']');
        await page.keyboard.up('Control');

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
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }
      const buffer = await response.buffer();
      const base64Image = buffer.toString('base64');
      return base64Image;

    } catch (error) {
      console.error(`Error downloading image: ${error}`);
      return null;
    }
}
async function createFileFromBase64(base64String){
    try {
        // Decode the base64 string to binary data
        const binaryData = Buffer.from(base64String, 'base64');
        const type = await fileType.fileTypeFromBuffer(binaryData);
    
        // Use the detected file extension
        const filename = `image.${type.ext? type.ext : 'png'}`;
    
        // Define the file path in the main directory
        const filePath = path.join(__dirname, filename);
      
        // Write the binary data to a file
        fs.writeFileSync(filePath, binaryData, 'binary');
    
        console.log(`File created at ${filePath}`);
        return {success: true, path: filePath}
        
    } catch (error) {
        console.error(error)
        return ({success: false})
    }
}
