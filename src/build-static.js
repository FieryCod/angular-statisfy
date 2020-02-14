const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const util = require('util');

function mkdirp(dir, opts) {
    const mkdir = util.promisify(fs.mkdir);
    const stat = util.promisify(fs.stat);

    return mkdir(dir, opts = {})
        .then(() => dir)
        .catch(err => {
            return err.code == "ENOENT" ?
                mkdirp(path.dirname(dir), opts).then(() => mkdirp(dir, opts)) :
                stat(dir).then(() => dir);
        });
}

async function writeFile(filePath, contents) {
    await mkdirp(path.dirname(filePath));
    fs.writeFileSync(filePath, contents);
    return;
}

module.exports = {
  Statisfy: {
    async generateStaticHtml(config) {
      console.log('\t[fn Statisfy#generateStaticHTML] Running fn');

      const puppeteerArgs = [];

      if (config.sandBox === false) {
        puppeteerArgs.push(...[
          '--no-sandbox',
          '--disable-setuid-sandbox',
        ]);
      }

      console.log('\t[fn Statisfy#generateStaticHTML] Configuration: ' + JSON.stringify(config));

      const tries = config.tries || 3;

      console.log('\t[fn Statisfy#generateStaticHTML] launching browser..');

      try {
        const browser = await puppeteer.launch({args: puppeteerArgs});
        console.log('\t[fn Statisfy#generateStaticHTML] Browser launched!');

        for (const route of config.routes) {
          const fullRoute = config.host + route;

          if (config.verbose !== false) {
            console.log(`\t[fn Statisfy#generateStaticHTML] Processing route: ${fullRoute}`);
          }

          let html;
          let success = false;
          let tryCounter = 0;

          while (!success && tryCounter++ <= tries) {
            try {
              const page = await browser.newPage();
              await page.goto(fullRoute);
              html = await page.evaluate(() => document.documentElement.outerHTML);
              console.log(`\t[fn Statisfy#generateStaticHTML] Route scrapped succesfully. Killing route!`);
              await page.close();
              success = true;
            } catch (e) {
              if (config.verbose !== false) {
                console.warn(`\tCould not evaluate ${fullRoute} in`
                             + ` try ${tryCounter}.`);
                console.warn(`\tError: ${e}`);
              }
            }
          }

          if (!success) {
            console.error(`\tCould not evaluate ${fullRoute} in ${tryCounter} tries.`);
            continue;
          }

          const dom = cheerio.load(html);
          dom('script').each((index, item) => {
            if ('src' in item.attribs && !item.attribs.src.startsWith('http')) {
              dom(item).remove();
            }
          });

          dom('base').attr('href', config.host);

          const writeRoutePath = route.replace(`/${config.directory}/`, '');
          const fileName = `${(writeRoutePath && writeRoutePath !== '/' && writeRoutePath !== '') ? writeRoutePath : 'index'}.html`;

          console.error(`\t[fn Statisfy#generateStaticHTML] Generating file for route: ${route} -> ./${config.directory}/${fileName}`);

          const editedDom = dom.html();
          await writeFile(`${config.directory}/${fileName}`, editedDom);
        }

        console.log(`\t[fn Statisfy#generateStaticHTML] Killing browser!`);

        await browser.close();
      } catch (err) {
        console.err('\t' + err.message);
      }
    }
  }
};
