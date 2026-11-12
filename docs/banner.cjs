const { chromium } = require('playwright');
const html = `<html><body style="margin:0;width:1280px;height:360px;background:#f6f3ec;color:#1d1d1b;font-family:Georgia,'Times New Roman',serif;position:relative">
<div style="position:absolute;left:80px;top:46px;font-size:54px;font-weight:700;letter-spacing:-1px">m365-quick-check</div>
<div style="position:absolute;left:80px;top:122px;font-size:24px;color:#55534e;font-family:Helvetica,Arial,sans-serif">Twelve read-only checks of tenant settings. GET requests only.</div>
<div style="position:absolute;left:80px;top:190px;width:1120px;font-family:Menlo,Consolas,monospace;font-size:20px;line-height:1.7">
<div><span style="color:#55534e">QC005</span>  <span style="color:#b3261e;font-weight:700">FAIL</span>  Users can consent to any application</div>
<div><span style="color:#55534e">QC008</span>  <span style="color:#8a6d00;font-weight:700">WARN</span>  2 credentials expire within 30 days</div>
<div><span style="color:#55534e">QC010</span>  <span style="color:#2e7d32;font-weight:700">PASS</span>  Last directory sync 0.3 hours ago</div></div>
<div style="position:absolute;left:80px;bottom:26px;font-size:17px;color:#55534e;font-family:Helvetica,Arial,sans-serif">Node 18+. Zero dependencies. Fictional demo data.</div></body></html>`;
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 360 } });
await p.setContent(html); await p.screenshot({ path: process.argv[2] }); await b.close(); })();
