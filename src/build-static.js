const cheerio = require('cheerio');
const fs = require('fs');
const mkdirp = require('mkdirp');
const path = require('path');
const puppeteer = require('puppeteer');

function writeFile(filePath, contents, cb) {
    mkdirp(path.dirname(filePath), err => {
        if (err) {
            return cb(err);
        }

        fs.writeFile(filePath, contents, cb);
    });
}

module.exports = {
    Statisfy: {
        generateStaticHtml(config) {

            const puppeteerArgs = [];

            if (config.sandBox === false) {
                puppeteerArgs.push(...[
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                ]);
            }

            const tries = config.tries || 3;

            return (async () => {
                const browser = await puppeteer.launch({args: puppeteerArgs});

                for (const route of config.routes) {
                    const fullRoute = config.host + route;

                    if (config.verbose !== false) {
                        console.log(`Statisfying ${fullRoute}`);
                    }

                    let html;
                    let success = false;
                    let tryCounter = 0;

                    while (!success && tryCounter++ <= tries) {
                        try {
                            const page = await browser.newPage();
                            await page.goto(fullRoute);
                            html = await page.evaluate(() => document.documentElement.outerHTML);
                            await page.close();
                            success = true;
                        } catch (e) {
                            if (config.verbose !== false) {
                                console.warn(`Could not evaluate ${fullRoute} in`
                                             + ` try ${tryCounter}.`);
                                console.warn(`Error: ${e}`);
                            }
                        }
                    }

                    if (!success) {
                        console.error(`Could not evaluate ${fullRoute} in ${tryCounter} tries.`);
                        continue;
                    }

                    const dom = cheerio.load(html);
                    dom('script').each((index, item) => {
                        if ('src' in item.attribs && !item.attribs.src.startsWith('http')) {
                            dom(item).remove();
                        }
                    });

                    dom('base').attr('href', config.host);

                    const editedDom = dom.html();
                    writeFile(
                        `${config.directory}/${route ? route : 'index'}.html`,
                        editedDom,
                        err => {
                            if (err) {
                                console.error(err);
                            }
                        },
                    );
                }

                await browser.close();
            })();
        }
    }
};
