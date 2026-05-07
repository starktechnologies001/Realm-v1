const { Jimp } = require('jimp');
const path = '/Users/anonymous/Desktop/realmm/social-map-app/src/assets/logo.png';

async function main() {
    try {
        console.log("Reading image...");
        const image = await Jimp.read(path);
        
        // Assume top-left pixel is the background color
        const targetColor = image.getPixelColor(0, 0);
        const r = (targetColor >> 24) & 255;
        const g = (targetColor >> 16) & 255;
        const b = (targetColor >> 8) & 255;
        console.log(`Background color detected as: R:${r} G:${g} B:${b}`);

        const tolerance = 20;

        image.scan(0, 0, image.bitmap.width, image.bitmap.height, function(x, y, idx) {
            const currentR = this.bitmap.data[idx + 0];
            const currentG = this.bitmap.data[idx + 1];
            const currentB = this.bitmap.data[idx + 2];
            
            const diffR = Math.abs(currentR - r);
            const diffG = Math.abs(currentG - g);
            const diffB = Math.abs(currentB - b);

            if (diffR < tolerance && diffG < tolerance && diffB < tolerance) {
                this.bitmap.data[idx + 3] = 0; // Alpha to 0
            }
        });

        await image.write(path);
        
        // Also update favicon
        await image.write('/Users/anonymous/Desktop/realmm/social-map-app/public/favicon.png');
        console.log("Background removed and saved successfully!");
    } catch (e) {
        console.error("Error:", e);
    }
}

main();
