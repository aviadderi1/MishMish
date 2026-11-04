// דוח יום כ-PDF: מציירים על Canvas (הדפדפן מטפל בעברית ובכיווניות) ועוטפים את הדפים בקובץ PDF.
(function (g) {
  const W = 1240, H = 1754, M = 90; // A4 ב-150dpi
  const money = (n) => '₪' + Number(n || 0).toLocaleString('he-IL');
  const LABEL = { sent: 'לא הושלם', paid: 'נמסר ושולם', failed: 'לא נמסר' };
  const COLS = [ // מימין לשמאל: מיקום הקצה הימני ורוחב
    ['#', 44], ['לקוח', 230], ['עיר', 165], ['מוצר', 260], ['סטטוס', 145], ['משלוח', 95], ['סכום', 95]
  ];
  const PER_PAGE = 27;
  const dateLabel = (day) => new Date(day + 'T12:00').toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  function fit(ctx, text, w) {
    let t = String(text == null ? '' : text);
    if (ctx.measureText(t).width <= w) return t;
    while (t && ctx.measureText(t + '…').width > w) t = t.slice(0, -1);
    return t + '…';
  }

  function drawPage(r, rows, startIndex, pageNo, pages, isLast) {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, W, H);
    x.direction = 'rtl'; x.textBaseline = 'middle';
    const text = (s, px, py, font, color = '#15231D', align = 'right') => { x.font = font + ' Rubik, sans-serif'; x.fillStyle = color; x.textAlign = align; x.fillText(s, px, py); };
    // כותרת
    text('דוח יום', W - M, 120, '700 56px', '#123C2F');
    text(dateLabel(r.day), W - M, 180, '400 30px', '#56635C');
    text(r.driverName || '', M, 120, '600 38px', '#15231D', 'left');
    x.direction = 'ltr'; text(r.driverPhone || '', M, 178, '400 27px', '#56635C', 'left'); x.direction = 'rtl';
    x.fillStyle = '#123C2F'; x.fillRect(M, 220, W - 2 * M, 6);
    // טבלה
    let y = 260; const rowH = 58;
    x.fillStyle = '#123C2F'; x.fillRect(M, y, W - 2 * M, rowH);
    let rx = W - M - 14;
    COLS.forEach(([name, w], i) => {
      text(name, i === 6 ? M + 14 : rx, y + rowH / 2, '600 27px', '#FFFFFF', i === 6 ? 'left' : 'right');
      rx -= w;
    });
    y += rowH;
    rows.forEach((o, n) => {
      let cx = W - M - 14;
      const cells = [String(startIndex + n + 1), o.customer, o.city, o.product + (o.qty ? ` × ${o.qty}` : ''), LABEL[o.status] || '', o.fee ? money(o.fee) : '–', money(o.amount)];
      cells.forEach((cell, i) => {
        const w = COLS[i][1];
        x.font = (i === 1 || i === 6 ? '500' : '400') + ' 26px Rubik, sans-serif';
        const t = i >= 5 ? cell : fit(x, cell, w - 14);
        text(t, i === 6 ? M + 14 : cx, y + rowH / 2, (i === 1 || i === 6 ? '500' : '400') + ' 26px', o.status === 'paid' || i !== 4 ? '#15231D' : '#A33E0B', i === 6 ? 'left' : 'right');
        cx -= w;
      });
      y += rowH;
      x.fillStyle = '#D5DAD4'; x.fillRect(M, y - 1, W - 2 * M, 2);
    });
    if (isLast) {
      y += 50;
      const fees = r.fees || 0;
      const diff = r.counted - r.collected;
      const lines = [['סך הכול מחיר משלוחים לנהג', money(fees)], ['סך הכול נגבה מלקוחות', money(r.collected)], ['כסף שהנהג ספר', money(r.counted)]];
      if (r.payment != null) lines.unshift(['תשלום לנהג', money(r.payment)]);
      const boxW = 640, bx = M;
      lines.forEach(([a, b]) => {
        x.strokeStyle = '#D5DAD4'; x.lineWidth = 2; x.strokeRect(bx, y, boxW, 72);
        text(a, bx + boxW - 22, y + 36, '400 30px');
        text(b, bx + 22, y + 36, '700 32px', '#15231D', 'left');
        y += 72;
      });
      x.fillStyle = diff === 0 ? '#DDF0E8' : '#F9E7D8'; x.fillRect(bx, y, boxW, 76);
      const ink = diff === 0 ? '#0B5443' : '#6F2D08';
      text(diff === 0 ? 'הפרש' : diff < 0 ? 'הפרש (חסר)' : 'הפרש (עודף)', bx + boxW - 22, y + 38, '700 30px', ink);
      text(money(Math.abs(diff)), bx + 22, y + 38, '700 32px', ink, 'left');
      y += 110;
      x.font = '400 27px Rubik, sans-serif';
      text('הערת הנהג: ' + (r.note ? fit(x, r.note, W - 2 * M - 180) : 'ללא הערה'), W - M, y, '400 27px', '#3F4B45');
      y += 50;
      text(r.approved ? 'הדוח אושר על ידי המנהל' : 'הדוח ממתין לאישור המנהל', W - M, y, '500 27px', r.approved ? '#0B5443' : '#6F2D08');
    }
    // תחתית
    x.fillStyle = '#D5DAD4'; x.fillRect(M, H - 100, W - 2 * M, 2);
    const sent = r.sentAtMs ? new Date(r.sentAtMs).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    text(sent ? 'נשלח ב-' + sent : '', W - M, H - 70, '400 23px', '#56635C');
    text(`עמוד ${pageNo} מתוך ${pages}`, M, H - 70, '400 23px', '#56635C', 'left');
    return new Promise((res) => c.toBlob((b) => b.arrayBuffer().then((a) => res(new Uint8Array(a))), 'image/jpeg', 0.92));
  }

  function makePdf(jpegs) {
    const enc = new TextEncoder();
    const parts = []; let len = 0; const off = [];
    const put = (d) => { const b = typeof d === 'string' ? enc.encode(d) : d; parts.push(b); len += b.length; };
    const n = jpegs.length;
    const total = 2 + n * 3;
    put('%PDF-1.4\n');
    const obj = (id, body) => { off[id] = len; put(`${id} 0 obj\n`); body(); put('\nendobj\n'); };
    obj(1, () => put('<< /Type /Catalog /Pages 2 0 R >>'));
    obj(2, () => put(`<< /Type /Pages /Count ${n} /Kids [${jpegs.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] >>`));
    jpegs.forEach((j, i) => {
      const p = 3 + i * 3;
      obj(p, () => put(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im0 ${p + 1} 0 R >> >> /Contents ${p + 2} 0 R >>`));
      obj(p + 1, () => { put(`<< /Type /XObject /Subtype /Image /Width ${W} /Height ${H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${j.length} >>\nstream\n`); put(j); put('\nendstream'); });
      const content = 'q 595 0 0 842 0 0 cm /Im0 Do Q';
      obj(p + 2, () => put(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
    });
    const xref = len;
    let t = `xref\n0 ${total + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i <= total; i++) t += String(off[i]).padStart(10, '0') + ' 00000 n \n';
    put(t + `trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    const out = new Uint8Array(len); let o = 0;
    parts.forEach((b) => { out.set(b, o); o += b.length; });
    return out;
  }

  async function buildPdf(r) {
    if (document.fonts && document.fonts.load) await Promise.all(['400', '500', '600', '700'].map((w) => document.fonts.load(`${w} 20px Rubik`, 'אב').catch(() => {})));
    const rows = r.rows || [];
    const chunks = [];
    for (let i = 0; i < rows.length; i += PER_PAGE) chunks.push(rows.slice(i, i + PER_PAGE));
    if (!chunks.length) chunks.push([]);
    // דף אחרון צריך מקום לסיכום: אם הוא מלא, הסיכום עובר לדף משלו
    if (chunks[chunks.length - 1].length > 13) chunks.push([]);
    const jpegs = [];
    for (let p = 0; p < chunks.length; p++) jpegs.push(await drawPage(r, chunks[p], p * PER_PAGE, p + 1, chunks.length, p === chunks.length - 1));
    return makePdf(jpegs);
  }

  // דוח חודשי לנהג: שורה לכל יום וסיכום
  const MCOLS = [['תאריך', 270], ['משלוחים', 120], ['נגבה', 150], ['נספר', 150], ['הפרש', 120], ['מחיר משלוח', 130], ['תשלום', 120]];
  function drawMonthPage(m, rows, pageNo, pages, isLast) {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, W, H);
    x.direction = 'rtl'; x.textBaseline = 'middle';
    const text = (s, px, py, font, color = '#15231D', align = 'right') => { x.font = font + ' Rubik, sans-serif'; x.fillStyle = color; x.textAlign = align; x.fillText(s, px, py); };
    text('דוח חודשי', W - M, 120, '700 56px', '#123C2F');
    text(g.UI.monthLabel(m.month), W - M, 180, '400 30px', '#56635C');
    text(m.driverName || '', M, 120, '600 38px', '#15231D', 'left');
    x.direction = 'ltr'; text(m.driverPhone || '', M, 178, '400 27px', '#56635C', 'left'); x.direction = 'rtl';
    x.fillStyle = '#123C2F'; x.fillRect(M, 220, W - 2 * M, 6);
    let y = 260; const rowH = 54;
    const row = (cells, font, color, bg) => {
      if (bg) { x.fillStyle = bg; x.fillRect(M, y, W - 2 * M, rowH); }
      let rx = W - M - 12;
      cells.forEach((cell, i) => { text(cell, rx, y + rowH / 2, font, color); rx -= MCOLS[i][1]; });
      y += rowH;
    };
    row(MCOLS.map((c0) => c0[0]), '600 24px', '#FFFFFF', '#123C2F');
    rows.forEach((d) => {
      const diff = d.hasReport ? d.counted - d.collected : null;
      row([new Date(d.day + 'T12:00').toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'numeric' }), String(d.delivered), money(d.collected), d.hasReport ? money(d.counted) : '–', diff == null ? '–' : (diff === 0 ? '0' : (diff < 0 ? '-' : '+') + money(Math.abs(diff))), money(d.fees), d.hasPayment ? money(d.payment) : '–'], '400 25px', '#15231D');
      x.fillStyle = '#D5DAD4'; x.fillRect(M, y - 1, W - 2 * M, 2);
    });
    if (isLast) {
      y += 24;
      const sum = (k) => m.days.reduce((s, d) => s + d[k], 0);
      row(['סך הכול', String(sum('delivered')), money(sum('collected')), money(sum('counted')), '', money(sum('fees')), money(sum('payment'))], '700 25px', '#15231D', '#E1ECF7');
    }
    x.fillStyle = '#D5DAD4'; x.fillRect(M, H - 100, W - 2 * M, 2);
    text(`עמוד ${pageNo} מתוך ${pages}`, M, H - 70, '400 23px', '#56635C', 'left');
    return new Promise((res) => c.toBlob((b) => b.arrayBuffer().then((a) => res(new Uint8Array(a))), 'image/jpeg', 0.92));
  }
  async function buildMonthPdf(m) {
    if (document.fonts && document.fonts.load) await Promise.all(['400', '600', '700'].map((w) => document.fonts.load(`${w} 20px Rubik`, 'אב').catch(() => {})));
    const rows = [...m.days].sort((a, b) => (a.day < b.day ? -1 : 1));
    const chunks = [];
    for (let i = 0; i < rows.length; i += 24) chunks.push(rows.slice(i, i + 24));
    if (!chunks.length) chunks.push([]);
    const jpegs = [];
    for (let p = 0; p < chunks.length; p++) jpegs.push(await drawMonthPage(m, chunks[p], p + 1, chunks.length, p === chunks.length - 1));
    return makePdf(jpegs);
  }
  const openMonth = async (m) => deliver(await buildMonthPdf(m), `דוח-חודשי-${m.driverName || 'נהג'}-${m.month}.pdf`, false);

  async function open(r, share) {
    return deliver(await buildPdf(r), `דוח-${r.driverName || 'נהג'}-${r.day}.pdf`, share);
  }
  async function deliver(bytes, name, share) {
    if (g.AndroidApp) {
      let bin = ''; for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
      g.AndroidApp.openFile(name, btoa(bin), 'application/pdf', !!share);
      return;
    }
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  g.Report = { buildPdf, open, buildMonthPdf, openMonth };
})(self);
