    const $ = (selector) => document.querySelector(selector);
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));

    const eur = (value) => value == null ? '' : Number(value).toLocaleString('it-IT', {
      style: 'currency',
      currency: 'EUR'
    });

    const oggi = () => new Date().toISOString().slice(0, 10);
    const STATI = [
      ['da_fare', 'Da fare'],
      ['in_corso', 'In corso'],
      ['pronto', 'Pronto'],
      ['consegnato', 'Consegnato']
    ];

    const COL = {
      da_fare: '--s1',
      in_corso: '--s2',
      pronto: '--s3',
      consegnato: '--s4'
    };

    const FILT = [
      ['attivi', 'Attivi'],
      ['da_fare', 'Da fare'],
      ['in_corso', 'In corso'],
      ['pronto', 'Pronti'],
      ['consegnato', 'Consegnati'],
      ['tutti', 'Tutti']
    ];

    let db;
    let tab = 'riepilogo';
    let filtro = 'attivi';
    let q = '';
    let clienti = [];
    let lavori = [];
    let clienteEspanso = null;

    function toast(message) {
      const toastElement = $('#toast');
      toastElement.textContent = message;
      toastElement.style.display = 'block';
      setTimeout(() => {
        toastElement.style.display = 'none';
      }, 3500);
    }

    function readConfig() {
      try {
        return JSON.parse(localStorage.getItem('cfg'));
      } catch {
        return null;
      }
    }

    function saveConfig(config) {
      localStorage.setItem('cfg', JSON.stringify(config));
    }

    async function init() {
      const config = readConfig();
      if (!config) {
        renderSetup();
        return;
      }

      db = supabase.createClient(config.url, config.key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          storage: window.localStorage
        }
      });

      db.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') {
          renderLogin();
        }
      });

      const { data } = await db.auth.getSession();
      if (data.session) {
        loadData();
      } else {
        renderLogin();
      }
    }

    function renderSetup() {
      $('#app').classList.remove('wide');
      $('#app').classList.remove('login-page');
      $('#app').innerHTML = `
        <h1>Collega il database</h1>
        <p class="mu">Incolla l’indirizzo del progetto Supabase e la chiave pubblica (anon o publishable). Mai la chiave service_role.</p>
        <form id="setup-form">
          <label>Indirizzo del progetto
            <input name="url" type="url" placeholder="https://xxxx.supabase.co" required>
          </label>
          <label>Chiave pubblica
            <input name="key" required>
          </label>
          <button>Salva e continua</button>
        </form>
      `;

      $('#setup-form').onsubmit = (event) => {
        event.preventDefault();
        const formData = Object.fromEntries(new FormData(event.target));
        saveConfig({
          url: formData.url.trim(),
          key: formData.key.trim()
        });
        init();
      };
    }

    function renderLogin() {
      $('#app').classList.remove('wide');
      $('#app').classList.add('login-page');
      const rememberedEmail = localStorage.getItem('rememberedEmail') || '';
      $('#app').innerHTML = `
        <h1 class="brand-title"><img src="logo.svg" alt=""><span>Officina di Casa</span></h1>
        <form id="login-form">
          <label>Email
            <input name="email" type="email" autocomplete="username" value="${esc(rememberedEmail)}" required>
          </label>
          <label>Password
            <input name="password" type="password" autocomplete="current-password" required>
          </label>
          <label class="remember-login">
            <span>Ricorda l’email su questo dispositivo</span>
            <input name="rememberEmail" type="checkbox"${rememberedEmail ? ' checked' : ''}>
          </label>
          <div class="row" style="justify-content:flex-start">
            <button>Accedi</button>
            <button type="button" class="ghost" id="change-db">Cambia database</button>
          </div>
        </form>
      `;

      $('#change-db').onclick = () => {
        localStorage.removeItem('cfg');
        renderSetup();
      };

      $('#login-form').onsubmit = async (event) => {
        event.preventDefault();
        const formData = Object.fromEntries(new FormData(event.target));
        const { email, password, rememberEmail } = formData;
        if (rememberEmail) {
          localStorage.setItem('rememberedEmail', email);
        } else {
          localStorage.removeItem('rememberedEmail');
        }

        const { error } = await db.auth.signInWithPassword({ email, password });
        if (error) {
          toast('Accesso non riuscito: ' + error.message);
          return;
        }
        loadData();
      };
    }

    async function loadData() {
      const [clientiResult, lavoriResult] = await Promise.all([
        db.from('clienti').select('*').order('nome'),
        db.from('lavori').select('*').order('created_at', { ascending: false })
      ]);

      const error = clientiResult.error || lavoriResult.error;
      if (error) {
        if (error.code === 'PGRST301' || error.status === 401 || /jwt/i.test(error.message)) {
          renderLogin();
          return;
        }
        toast(error.message.includes('appuntamento_at')
          ? 'Applica prima supabase_migration_features.sql in Supabase.'
          : 'Errore: ' + error.message);
        return;
      }

      clienti = clientiResult.data;
      lavori = lavoriResult.data;
      renderShell();
    }

    function renderShell() {
      $('#app').classList.add('wide');
      $('#app').classList.remove('login-page');
      $('#app').innerHTML = `
        <header>
          <h1 class="brand-title"><img src="logo.svg" alt=""><span>Officina di Casa</span></h1>
          <button class="ghost" id="logout">Esci</button>
        </header>
        <nav class="tabs" aria-label="Sezioni">
          ${[['riepilogo', 'Riepilogo'], ['lavori', 'Lavori'], ['calendario', 'Calendario'], ['clienti', 'Clienti'], ['report', 'Report']]
            .map(([key, label]) => `<button data-t="${key}" class="${key === tab ? 'on' : ''}">${label}</button>`).join('')}
        </nav>
        <div id="bar"></div>
        <div id="list"></div>
        <button class="fab" id="add" aria-label="Aggiungi">+</button>
      `;

      $('#logout').onclick = async () => {
        await db.auth.signOut();
        renderLogin();
      };

      $('#add').onclick = () => {
        tab === 'clienti' ? openClientForm({}) : openWorkForm({});
      };

      document.querySelectorAll('.tabs button').forEach((button) => {
        button.onclick = () => {
          tab = button.dataset.t;
          q = '';
          clienteEspanso = null;
          renderShell();
        };
      });

      $('#list').onchange = async (event) => {
        const field = event.target;
        if (field.id === 'csv-import') {
          const [file] = field.files;
          field.value = '';
          if (file) await importaCSV(file);
          return;
        }

        const id = field.dataset.id;
        if (!id) return;

        const stato = field.value;
        const data_consegna = stato === 'consegnato' ? oggi() : null;
        const { error } = await db.from('lavori').update({ stato, data_consegna }).eq('id', id);

        if (error) {
          toast(error.message);
          return;
        }

        const lavoro = lavori.find((item) => String(item.id) === id);
        if (lavoro) Object.assign(lavoro, { stato, data_consegna });
        renderList();
      };

      $('#list').onclick = (event) => {
        const button = event.target.closest('button');
        if (!button) return;

        if (button.dataset.e) {
          openWorkForm(lavori.find((item) => String(item.id) === button.dataset.e));
        } else if (button.dataset.c) {
          openClientForm(clienti.find((item) => String(item.id) === button.dataset.c));
        } else if (button.dataset.details) {
          openWorkDetails(lavori.find((item) => String(item.id) === button.dataset.details));
        } else if (button.dataset.clientExp) {
          const id = button.dataset.clientExp;
          clienteEspanso = String(clienteEspanso) === id ? null : id;
          renderList();
        } else if (button.dataset.showTab) {
          tab = button.dataset.showTab;
          q = '';
          renderShell();
        } else if (button.dataset.openJob) {
          openWorkDetails(lavori.find((item) => String(item.id) === button.dataset.openJob));
        } else if (button.dataset.export) {
          esportaCSV(button.dataset.export);
        } else if (button.dataset.import) {
          $('#csv-import').click();
        }
      };

      renderToolbar();
      renderList();
    }

    function renderToolbar() {
      const filters = tab === 'lavori'
        ? `<div class="chips">${FILT.map(([key, label]) => `<button data-f="${key}" class="${key === filtro ? 'on' : ''}">${label}</button>`).join('')}</div>`
        : '';
      const searchable = ['lavori', 'clienti', 'calendario'].includes(tab);
      $('#bar').innerHTML = filters + (searchable
        ? `<label class="search-label"><input id="q" type="search" placeholder="Cerca" value="${esc(q)}"></label>`
        : '');

      document.querySelectorAll('[data-f]').forEach((button) => {
        button.onclick = () => {
          filtro = button.dataset.f;
          renderToolbar();
          renderList();
        };
      });

      const search = $('#q');
      if (search) {
        search.oninput = (event) => {
          q = event.target.value;
          renderList();
        };
      }
    }

    function formatDate(value) {
      if (!value) return '—';
      const date = new Date(`${value.slice(0, 10)}T00:00:00`);
      return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('it-IT');
    }

    function formatDateTime(value) {
      if (!value) return 'Non programmato';
      const date = new Date(value);
      return Number.isNaN(date.getTime())
        ? 'Non programmato'
        : date.toLocaleString('it-IT', { dateStyle: 'medium', timeStyle: 'short' });
    }

    function toDateTimeLocal(value) {
      if (!value) return '';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '';
      date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
      return date.toISOString().slice(0, 16);
    }

    function jobCost(job) {
      return Number(job.costo_ricambi || 0) + Number(job.costo_manodopera || 0);
    }

    function jobMargin(job) {
      return Number(job.importo || 0) - jobCost(job);
    }

    function findCliente(clienteId) {
      return clienti.find((cliente) => String(cliente.id) === String(clienteId));
    }

    function nomeCliente(cliente) {
      return [cliente?.nome, cliente?.cognome].filter(Boolean).join(' ');
    }

    function safePhotoLinks(value) {
      const photos = Array.isArray(value) ? value : [];
      return photos.map((photo) => {
        try {
          const url = new URL(photo);
          if (!['http:', 'https:'].includes(url.protocol)) return '';
          return `<a href="${esc(url.href)}" target="_blank" rel="noopener noreferrer">Apri foto</a>`;
        } catch {
          return '';
        }
      }).filter(Boolean).join('');
    }

    function renderSummary() {
      const attivi = lavori.filter((job) => job.stato !== 'consegnato');
      const pronti = lavori.filter((job) => job.stato === 'pronto');
      const inIncasso = lavori.reduce((total, job) => total + Number(job.importo || 0), 0);
      const appuntamenti = lavori.filter((job) => job.appuntamento_at && new Date(job.appuntamento_at) >= new Date())
        .sort((a, b) => new Date(a.appuntamento_at) - new Date(b.appuntamento_at)).slice(0, 5);

      return `
        <div class="dashboard-grid">
          <section class="summary-grid" aria-label="Riepilogo">
            <article class="summary-card"><span>Lavori attivi</span><strong>${attivi.length}</strong></article>
            <article class="summary-card"><span>Pronti</span><strong>${pronti.length}</strong></article>
            <article class="summary-card"><span>Clienti</span><strong>${clienti.length}</strong></article>
            <article class="summary-card"><span>Importo lavori</span><strong>${eur(inIncasso)}</strong></article>
          </section>
          <section class="panel">
            <div class="section-heading"><h2>Prossimi appuntamenti</h2><button class="ghost" data-show-tab="calendario">Apri calendario</button></div>
            ${appuntamenti.length ? appuntamenti.map((job) => `
              <button class="agenda-row" data-open-job="${esc(job.id)}">
                <span><strong>${esc(job.targa || 'Lavoro')}</strong><span>${esc(job.veicolo || '')}</span></span>
                <span>${esc(formatDateTime(job.appuntamento_at))}</span>
              </button>
            `).join('') : '<p class="mu">Non ci sono appuntamenti programmati.</p>'}
          </section>
          <section class="panel">
            <div class="section-heading"><h2>Lavori recenti</h2><button class="ghost" data-show-tab="lavori">Vedi tutti</button></div>
            ${lavori.slice(0, 4).map((job) => `<div class="recent-row"><strong>${esc(job.targa || 'Senza targa')} · ${esc(job.veicolo || '')}</strong><span class="status-label">${esc((STATI.find(([key]) => key === job.stato) || ['', 'Da fare'])[1])}</span></div>`).join('') || '<p class="mu">Ancora nessun lavoro registrato.</p>'}
          </section>
        </div>
      `;
    }

    function renderJobDetails(job) {
      const cliente = findCliente(job.cliente_id);
      const history = job.targa
        ? lavori.filter((item) => item.id !== job.id && item.targa?.toLowerCase() === job.targa.toLowerCase())
        : [];
      return `
        <div class="job-details">
          <div class="detail-grid">
            <div><span>Cliente</span><strong>${esc(nomeCliente(cliente) || '—')}</strong></div>
            <div><span>Data ingresso</span><strong>${esc(formatDate(job.data_ingresso))}</strong></div>
            <div><span>Ricambi</span><strong>${eur(job.costo_ricambi)}</strong></div>
            <div><span>Manodopera</span><strong>${eur(job.costo_manodopera)}</strong></div>
            <div><span>Margine stimato</span><strong>${eur(jobMargin(job))}</strong></div>
            <div><span>Data consegna</span><strong>${esc(formatDate(job.data_consegna))}</strong></div>
          </div>
          ${job.note ? `<p><strong>Note:</strong> ${esc(job.note)}</p>` : ''}
          ${safePhotoLinks(job.foto_url) ? `<div class="photo-links"><strong>Foto:</strong> ${safePhotoLinks(job.foto_url)}</div>` : ''}
          ${history.length ? `<div class="history-list"><strong>Altri interventi per ${esc(job.targa)}:</strong>${history.map((item) => `<p>${esc(formatDate(item.data_ingresso))} · ${esc(item.descrizione || item.veicolo || 'Lavoro')} (${esc((STATI.find(([key]) => key === item.stato) || ['', 'Da fare'])[1])})</p>`).join('')}</div>` : ''}
        </div>
      `;
    }

    function openWorkDetails(job) {
      if (!job) return;
      const dialog = $('#dlg');
      const cliente = findCliente(job.cliente_id);
      dialog.classList.remove('work-form-dialog');
      dialog.classList.add('detail-dialog');
      dialog.innerHTML = `
        <div class="detail-heading">
          <div>
            <h2>Scheda lavoro</h2>
            <div class="job-title"><strong>${esc(job.targa || 'Senza targa')} · ${esc(job.veicolo || 'Veicolo non specificato')}</strong></div>
            ${cliente ? `<div class="mu">${esc(nomeCliente(cliente))}</div>` : ''}
          </div>
          <button type="button" class="ghost" id="close-details" aria-label="Chiudi scheda">Chiudi</button>
        </div>
        <p>${esc(job.descrizione || '')}</p>
        <p class="mu">Stato: ${esc((STATI.find(([key]) => key === job.stato) || ['', 'Da fare'])[1])} · Importo: ${eur(job.importo)}</p>
        ${renderJobDetails(job)}
        <div class="row">
          <button type="button" class="ghost" id="close-details-footer">Chiudi</button>
          <button type="button" id="edit-details">Modifica</button>
        </div>
      `;
      $('#close-details').onclick = () => dialog.close();
      $('#close-details-footer').onclick = () => dialog.close();
      $('#edit-details').onclick = () => {
        dialog.close();
        openWorkForm(job);
      };
      dialog.showModal();
    }

    function renderJobCard(job) {
      const cliente = findCliente(job.cliente_id);
      return `
        <article class="card job-card" style="--c:var(${COL[job.stato] || '--s1'})">
          <div class="top">
            <span class="plate">${esc(job.targa || '—')}</span>
            <strong>${eur(job.importo)}</strong>
          </div>
          <div class="job-title"><strong>${esc(job.veicolo || 'Veicolo non specificato')}</strong>${cliente ? ` · ${esc(nomeCliente(cliente))}` : ''}</div>
          <div>${esc(job.descrizione || '')}</div>
          <div class="mu">Ingresso ${esc(formatDate(job.data_ingresso))}</div>
          <div class="top job-actions">
            <select class="st" data-id="${esc(job.id)}" aria-label="Stato">
              ${STATI.map(([key, label]) => `<option value="${key}"${key === job.stato ? ' selected' : ''}>${label}</option>`).join('')}
            </select>
            <button class="ghost" data-details="${esc(job.id)}">Scheda lavoro</button>
            <button class="ghost" data-e="${esc(job.id)}">Modifica</button>
          </div>
        </article>
      `;
    }

    function renderWorkList() {
      const searchText = q.trim().toLowerCase();
      const filtered = lavori.filter((job) => {
        const matchesFilter = filtro === 'tutti' || (filtro === 'attivi' ? job.stato !== 'consegnato' : job.stato === filtro);
        const cliente = findCliente(job.cliente_id);
        const searchable = [job.targa, job.veicolo, job.descrizione, nomeCliente(cliente)].join(' ').toLowerCase();
        return matchesFilter && (!searchText || searchable.includes(searchText));
      });
      return filtered.length
        ? `<div class="cards-grid work-grid">${filtered.map((job) => renderJobCard(job)).join('')}</div>`
        : '';
    }

    function renderCalendar() {
      const searchText = q.trim().toLowerCase();
      const appointments = lavori.filter((job) => {
        const cliente = findCliente(job.cliente_id);
        return job.appuntamento_at && [job.targa, job.veicolo, job.descrizione, nomeCliente(cliente)].join(' ').toLowerCase().includes(searchText);
      }).sort((a, b) => new Date(a.appuntamento_at) - new Date(b.appuntamento_at));

      return appointments.length
        ? `<div class="cards-grid agenda-grid">${appointments.map((job) => `<section class="panel agenda-card"><div class="section-heading"><div><strong>${esc(formatDateTime(job.appuntamento_at))}</strong><p>${esc(job.targa || 'Lavoro')} · ${esc(job.veicolo || '')} · ${esc(nomeCliente(findCliente(job.cliente_id)) || 'Cliente non assegnato')}</p></div><button class="ghost" data-open-job="${esc(job.id)}">Apri lavoro</button></div><p>${esc(job.descrizione || '')}</p></section>`).join('')}</div>`
        : '<div class="empty">Nessun appuntamento trovato.</div>';
    }

    function renderClientList() {
      const searchText = q.trim().toLowerCase();
      const cards = clienti.filter((cliente) => !searchText || [nomeCliente(cliente), cliente.telefono].join(' ').toLowerCase().includes(searchText))
        .map((cliente) => {
          const history = lavori.filter((job) => String(job.cliente_id) === String(cliente.id))
            .sort((a, b) => new Date(b.created_at || b.data_ingresso) - new Date(a.created_at || a.data_ingresso));
          const expanded = String(clienteEspanso) === String(cliente.id);
          return `
            <article class="card client-card">
              <div class="top"><strong>${esc(nomeCliente(cliente))}</strong><button class="ghost" data-c="${esc(cliente.id)}">Modifica</button></div>
              ${cliente.telefono ? `<a href="tel:${esc(cliente.telefono)}">${esc(cliente.telefono)}</a>` : ''}
              <div class="mu">${cliente.note ? `${esc(cliente.note)} · ` : ''}${history.length} ${history.length === 1 ? 'lavoro' : 'lavori'}</div>
              <div class="top job-actions"><button class="ghost" data-client-exp="${esc(cliente.id)}">${expanded ? 'Nascondi storico' : 'Storico interventi'}</button></div>
              ${expanded ? `<div class="history-list">${history.map((job) => `<div class="history-row"><span><strong>${esc(formatDate(job.data_ingresso))} · ${esc(job.targa || 'Senza targa')}</strong><br>${esc(job.veicolo || '')} — ${esc(job.descrizione || '')}</span><span>${esc((STATI.find(([key]) => key === job.stato) || ['', 'Da fare'])[1])}</span></div>`).join('') || '<p>Nessun intervento registrato.</p>'}</div>` : ''}
            </article>
          `;
        }).join('');
      return cards ? `<div class="cards-grid client-grid">${cards}</div>` : '';
    }

    function renderReport() {
      const ricavi = lavori.reduce((total, job) => total + Number(job.importo || 0), 0);
      const costi = lavori.reduce((total, job) => total + jobCost(job), 0);
      const margine = ricavi - costi;
      const completati = lavori.filter((job) => job.stato === 'consegnato').length;
      return `
        <section class="summary-grid">
          <article class="summary-card"><span>Importo lavori</span><strong>${eur(ricavi)}</strong></article>
          <article class="summary-card"><span>Costi registrati</span><strong>${eur(costi)}</strong></article>
          <article class="summary-card"><span>Margine stimato</span><strong>${eur(margine)}</strong></article>
          <article class="summary-card"><span>Lavori consegnati</span><strong>${completati}</strong></article>
        </section>
        <section class="panel">
          <h2>Importa ed esporta dati</h2>
          <p class="mu">Importa un CSV di lavori o clienti esportato da questa app. Per collegare i lavori ai clienti, importa prima il CSV dei clienti.</p>
          <div class="export-actions">
            <button type="button" data-import="csv">Importa CSV</button>
            <input id="csv-import" class="csv-file-input" type="file" accept=".csv,text/csv" aria-label="Seleziona un file CSV">
          </div>
          <p class="mu">Scarica un file CSV compatibile con Excel e gli altri fogli di calcolo.</p>
          <div class="export-actions"><button data-export="lavori">Esporta lavori</button><button class="ghost" data-export="clienti">Esporta clienti</button></div>
          <p class="mu">Il margine è una stima calcolata come importo meno ricambi e manodopera; non è un dato contabile.</p>
        </section>
      `;
    }

    function renderList() {
      let html = '';
      if (tab === 'riepilogo') html = renderSummary();
      else if (tab === 'lavori') html = renderWorkList();
      else if (tab === 'calendario') html = renderCalendar();
      else if (tab === 'clienti') html = renderClientList();
      else if (tab === 'report') html = renderReport();

      $('#list').innerHTML = html || '<div class="empty">Niente da mostrare. Tocca + per aggiungere.</div>';
    }

    function normalizzaCSV(value) {
      return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().trim().replace(/[^a-z0-9]+/g, '');
    }

    function leggiCSV(text) {
      const firstRecord = String(text).replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0];
      let quoted = false;
      const counts = { ';': 0, ',': 0, '\t': 0 };
      for (let index = 0; index < firstRecord.length; index += 1) {
        const char = firstRecord[index];
        if (char === '"' && firstRecord[index + 1] === '"' && quoted) {
          index += 1;
        } else if (char === '"') {
          quoted = !quoted;
        } else if (!quoted && Object.hasOwn(counts, char)) {
          counts[char] += 1;
        }
      }
      const delimiter = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      if (!delimiter || delimiter[1] === 0) throw new Error('Non trovo il separatore nel file CSV.');

      const rows = [];
      let row = [];
      let cell = '';
      let inQuotes = false;
      let afterQuote = false;
      const source = String(text).replace(/^\uFEFF/, '');
      for (let index = 0; index < source.length; index += 1) {
        const char = source[index];
        if (inQuotes) {
          if (char === '"' && source[index + 1] === '"') {
            cell += '"';
            index += 1;
          } else if (char === '"') {
            inQuotes = false;
            afterQuote = true;
          } else {
            cell += char;
          }
          continue;
        }

        if (afterQuote) {
          if (char === delimiter[0]) {
            row.push(cell);
            cell = '';
            afterQuote = false;
          } else if (char === '\r' || char === '\n') {
            row.push(cell);
            if (row.some((value) => value.trim())) rows.push(row);
            row = [];
            cell = '';
            afterQuote = false;
            if (char === '\r' && source[index + 1] === '\n') index += 1;
          } else if (!/\s/.test(char)) {
            throw new Error('Il file CSV contiene virgolette non valide.');
          }
          continue;
        }

        if (char === '"') {
          if (cell.length) throw new Error('Il file CSV contiene virgolette non valide.');
          inQuotes = true;
        } else if (char === delimiter[0]) {
          row.push(cell);
          cell = '';
        } else if (char === '\r' || char === '\n') {
          row.push(cell);
          if (row.some((value) => value.trim())) rows.push(row);
          row = [];
          cell = '';
          if (char === '\r' && source[index + 1] === '\n') index += 1;
        } else {
          cell += char;
        }
      }

      if (inQuotes) throw new Error('Il file CSV contiene una cella non chiusa.');
      if (cell || row.length) {
        row.push(cell);
        if (row.some((value) => value.trim())) rows.push(row);
      }
      if (rows.length < 2) throw new Error('Il file CSV non contiene righe da importare.');

      const headers = rows[0].map(normalizzaCSV);
      return rows.slice(1).map((values) => {
        const record = {};
        headers.forEach((header, index) => {
          if (header && record[header] === undefined) record[header] = (values[index] || '').trim();
        });
        return record;
      });
    }

    function valoreCSV(record, ...headers) {
      for (const header of headers) {
        const value = record[normalizzaCSV(header)];
        if (value !== undefined) return value;
      }
      return '';
    }

    function dataCSV(value, rowNumber) {
      const text = String(value || '').trim();
      if (!text) return null;
      let parts = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
      if (parts) {
        const [, year, month, day] = parts.map(Number);
        const date = new Date(Date.UTC(year, month - 1, day));
        if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) return text;
      }
      parts = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
      if (parts) {
        const [, day, month, year] = parts.map(Number);
        const date = new Date(Date.UTC(year, month - 1, day));
        if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) {
          return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
      }
      throw new Error(`Data non valida alla riga ${rowNumber}: ${text}`);
    }

    function numeroCSV(value, rowNumber, label, defaultValue = null) {
      const text = String(value || '').trim().replace(/[€\s]/g, '');
      if (!text) return defaultValue;
      let normalized = text;
      if (normalized.includes(',') && normalized.includes('.')) {
        normalized = normalized.lastIndexOf(',') > normalized.lastIndexOf('.')
          ? normalized.replace(/\./g, '').replace(',', '.')
          : normalized.replace(/,/g, '');
      } else {
        normalized = normalized.replace(',', '.');
      }
      const number = Number(normalized);
      if (!Number.isFinite(number)) throw new Error(`${label} non valido alla riga ${rowNumber}.`);
      return number;
    }

    function statoCSV(value, rowNumber) {
      const status = normalizzaCSV(value);
      const statuses = new Map([
        ['dafare', 'da_fare'], ['da_fare', 'da_fare'],
        ['incorso', 'in_corso'], ['in_corso', 'in_corso'],
        ['pronto', 'pronto'], ['consegnato', 'consegnato'], ['consegnata', 'consegnato']
      ]);
      if (!status) return 'da_fare';
      const normalized = statuses.get(status);
      if (!normalized) throw new Error(`Stato non riconosciuto alla riga ${rowNumber}: ${value}`);
      return normalized;
    }

    function chiaveCliente(nome) {
      return normalizzaCSV(nome);
    }

    function importaClienti(records) {
      const errors = [];
      const existing = new Set(clienti.map((cliente) => (
        `${chiaveCliente(nomeCliente(cliente))}|${normalizzaCSV(cliente.telefono)}`
      )));
      const incoming = new Set();
      const payload = [];

      records.forEach((record, index) => {
        const rowNumber = index + 2;
        const nome = valoreCSV(record, 'Nome').trim();
        const cognome = valoreCSV(record, 'Cognome').trim();
        const telefono = valoreCSV(record, 'Telefono').trim();
        if (!nome) {
          errors.push(`Nome mancante alla riga ${rowNumber}.`);
          return;
        }
        const key = `${chiaveCliente([nome, cognome].filter(Boolean).join(' '))}|${normalizzaCSV(telefono)}`;
        if (!existing.has(key) && !incoming.has(key)) {
          payload.push({ nome, cognome: cognome || null, telefono: telefono || null, note: valoreCSV(record, 'Note').trim() || null });
          incoming.add(key);
        }
      });

      if (errors.length) throw new Error(errors.slice(0, 5).join(' ') + (errors.length > 5 ? ` (+${errors.length - 5} errori)` : ''));
      return { payload, skipped: records.length - payload.length };
    }

    function importaLavori(records) {
      const errors = [];
      const clientsByName = new Map();
      clienti.forEach((cliente) => {
        const key = chiaveCliente(nomeCliente(cliente));
        if (key && !clientsByName.has(key)) clientsByName.set(key, cliente.id);
      });
      const payload = records.map((record, index) => {
        const rowNumber = index + 2;
        try {
          const description = valoreCSV(record, 'Descrizione').trim();
          if (!description) throw new Error(`Descrizione mancante alla riga ${rowNumber}.`);
          const customerName = valoreCSV(record, 'Cliente').trim();
          const clientId = customerName ? clientsByName.get(chiaveCliente(customerName)) : null;
          if (customerName && !clientId) throw new Error(`Cliente "${customerName}" non trovato alla riga ${rowNumber}. Importa prima il CSV clienti.`);
          const photos = valoreCSV(record, 'Foto').split(/\s+/).filter(Boolean);
          for (const photo of photos) {
            let url;
            try {
              url = new URL(photo);
            } catch {
              throw new Error(`URL foto non valido alla riga ${rowNumber}.`);
            }
            if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`URL foto non valido alla riga ${rowNumber}.`);
          }

          return {
            targa: valoreCSV(record, 'Targa').trim().toUpperCase() || null,
            veicolo: valoreCSV(record, 'Veicolo').trim() || null,
            cliente_id: clientId,
            descrizione: description,
            stato: statoCSV(valoreCSV(record, 'Stato'), rowNumber),
            data_ingresso: dataCSV(valoreCSV(record, 'Data ingresso'), rowNumber) || oggi(),
            data_consegna: dataCSV(valoreCSV(record, 'Consegna', 'Data consegna'), rowNumber),
            importo: numeroCSV(valoreCSV(record, 'Importo'), rowNumber, 'Importo'),
            costo_ricambi: numeroCSV(valoreCSV(record, 'Ricambi'), rowNumber, 'Ricambi', 0),
            costo_manodopera: numeroCSV(valoreCSV(record, 'Manodopera'), rowNumber, 'Manodopera', 0),
            note: valoreCSV(record, 'Note').trim() || null,
            foto_url: photos
          };
        } catch (error) {
          errors.push(error.message);
          return null;
        }
      }).filter(Boolean);

      if (errors.length) throw new Error(errors.slice(0, 5).join(' ') + (errors.length > 5 ? ` (+${errors.length - 5} errori)` : ''));
      return payload;
    }

    async function importaCSV(file) {
      try {
        const records = leggiCSV(await file.text());
        const headers = Object.keys(records[0]);
        const isJobs = ['descrizione', 'stato', 'dataingresso'].some((header) => headers.includes(header));
        const isClients = headers.includes('nome') && ['cognome', 'telefono', 'note'].some((header) => headers.includes(header));
        if (isJobs === isClients) {
          throw new Error('Formato CSV non riconosciuto. Seleziona un CSV di lavori o clienti esportato da questa app.');
        }

        if (isClients) {
          const { payload, skipped } = importaClienti(records);
          if (!payload.length) {
            toast(`Nessun nuovo cliente da importare. Righe già presenti: ${skipped}.`);
            return;
          }
          if (!confirm(`Importare ${payload.length} clienti${skipped ? ` (saltando ${skipped} duplicati)` : ''}?`)) return;
          const { error } = await db.from('clienti').insert(payload);
          if (error) throw new Error(error.message);
          await loadData();
          toast(`Importati ${payload.length} clienti${skipped ? `; saltati ${skipped} duplicati` : ''}.`);
          return;
        }

        const payload = importaLavori(records);
        if (!confirm(`Importare ${payload.length} lavori?`)) return;
        const { error } = await db.from('lavori').insert(payload);
        if (error) throw new Error(error.message);
        await loadData();
        toast(`Importati ${payload.length} lavori.`);
      } catch (error) {
        toast(`Importazione non riuscita: ${error.message}`);
      }
    }

    function csvCell(value) {
      let text = String(value ?? '');
      if (typeof value !== 'number' && /^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    }

    function esportaCSV(kind) {
      const rows = kind === 'clienti'
        ? [
            ['Nome', 'Cognome', 'Telefono', 'Note', 'Numero lavori'],
            ...clienti.map((cliente) => [
              cliente.nome,
              cliente.cognome,
              cliente.telefono,
              cliente.note,
              lavori.filter((job) => String(job.cliente_id) === String(cliente.id)).length
            ])
          ]
        : [
            ['Targa', 'Veicolo', 'Cliente', 'Descrizione', 'Stato', 'Data ingresso', 'Appuntamento', 'Consegna', 'Importo', 'Ricambi', 'Manodopera', 'Margine stimato', 'Note', 'Foto'],
            ...lavori.map((job) => [
              job.targa,
              job.veicolo,
              nomeCliente(findCliente(job.cliente_id)),
              job.descrizione,
              (STATI.find(([key]) => key === job.stato) || ['', job.stato])[1],
              job.data_ingresso,
              job.appuntamento_at,
              job.data_consegna,
              job.importo,
              job.costo_ricambi,
              job.costo_manodopera,
              jobMargin(job),
              job.note,
              Array.isArray(job.foto_url) ? job.foto_url.join(' ') : ''
            ])
          ];

      const csv = '\uFEFF' + rows.map((row) => row.map(csvCell).join(';')).join('\r\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `officina-${kind}-${oggi()}.csv`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function openModal(title, fields, values, saveAction, deleteAction, dialogClass = '') {
      const dialog = $('#dlg');
      dialog.classList.remove('detail-dialog');
      dialog.classList.toggle('work-form-dialog', dialogClass === 'work-form-dialog');
      const requiredFields = ['nome', 'descrizione'];

      dialog.innerHTML = `
        <form id="modal-form">
          <h2>${title}</h2>
          ${fields.map(([key, label, type, options]) => {
            if (type === 'select') {
              return `
                <label>${label}
                  <select name="${key}">
                    ${options.map(([value, text]) => `<option value="${value}"${value === (values[key] ?? '') ? ' selected' : ''}>${esc(text)}</option>`).join('')}
                  </select>
                </label>
              `;
            }

            if (type === 'area' || type === 'photos') {
              const content = type === 'photos'
                ? (Array.isArray(values[key]) ? values[key].join('\n') : '')
                : values[key];
              return `
                <label>${label}
                  <textarea name="${key}" rows="${type === 'photos' ? 4 : 3}"${requiredFields.includes(key) ? ' required' : ''}>${esc(content)}</textarea>
                  ${type === 'photos' ? '<span class="field-help">Inserisci un link per riga (solo URL http/https).</span>' : ''}
                </label>
              `;
            }

            const value = type === 'datetime-local' ? toDateTimeLocal(values[key]) : values[key];
            return `
              <label>${label}
                <input name="${key}" type="${type || 'text'}"${type === 'number' ? ' step="0.01" min="0"' : ''} value="${esc(value)}"${requiredFields.includes(key) ? ' required' : ''}>
              </label>
            `;
          }).join('')}
          <div class="row">
            <button type="button" class="ghost" id="cancel">Annulla</button>
            ${deleteAction ? '<button type="button" class="danger" id="delete">Elimina</button>' : ''}
            <button>Salva</button>
          </div>
        </form>
      `;

      $('#cancel').onclick = () => dialog.close();

      if (deleteAction) {
        $('#delete').onclick = async () => {
          if (!confirm('Eliminare in modo definitivo?')) return;
          const { error } = await deleteAction();
          if (error) {
            toast(error.message);
            return;
          }
          dialog.close();
          loadData();
        };
      }

      $('#modal-form').onsubmit = async (event) => {
        event.preventDefault();
        const formData = Object.fromEntries(new FormData(event.target));

        Object.keys(formData).forEach((key) => {
          if (formData[key] === '') {
            formData[key] = null;
          }
        });

        if (formData.appuntamento_at) {
          formData.appuntamento_at = new Date(formData.appuntamento_at).toISOString();
        }

        if (formData.foto_url !== undefined) {
          const urls = String(formData.foto_url || '').split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
          for (const value of urls) {
            try {
              const url = new URL(value);
              if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
            } catch {
              toast('Ogni foto deve avere un URL valido che inizi con http:// o https://.');
              return;
            }
          }
          formData.foto_url = urls;
        }

        for (const key of ['costo_ricambi', 'costo_manodopera']) {
          if (formData[key] === undefined) continue;
          if (formData[key] === null) formData[key] = 0;
          if (formData[key] !== null && (!Number.isFinite(Number(formData[key])) || Number(formData[key]) < 0)) {
            toast('I costi devono essere numeri pari o superiori a zero.');
            return;
          }
        }

        const { error } = await saveAction(formData);
        if (error) {
          toast(/appuntamento_at|costo_ricambi|costo_manodopera|foto_url/.test(error.message)
            ? 'Applica prima supabase_migration_features.sql in Supabase.'
            : error.message);
          return;
        }

        dialog.close();
        loadData();
      };

      dialog.showModal();
    }

    function openWorkForm(work) {
      work = work || {};
      const isNew = !work.id;
      const current = isNew
        ? { stato: 'da_fare', data_ingresso: oggi(), costo_ricambi: 0, costo_manodopera: 0, foto_url: [] }
        : work;

      openModal(
        isNew ? 'Nuovo lavoro' : 'Modifica lavoro',
        [
          ['targa', 'Targa'],
          ['veicolo', 'Veicolo (marca e modello)'],
          ['cliente_id', 'Cliente', 'select', [['', 'Nessuno'], ...clienti.map((cliente) => [cliente.id, nomeCliente(cliente)])]],
          ['descrizione', 'Lavoro da fare', 'area'],
          ['stato', 'Stato', 'select', STATI],
          ['importo', 'Importo (€)', 'number'],
          ['costo_ricambi', 'Costo ricambi (€)', 'number'],
          ['costo_manodopera', 'Costo manodopera (€)', 'number'],
          ['data_ingresso', 'Data ingresso', 'date'],
          ['data_consegna', 'Data consegna', 'date'],
          ['foto_url', 'Link foto', 'photos'],
          ['note', 'Note', 'area']
        ],
        current,
        async (payload) => {
          if (payload.targa) {
            payload.targa = payload.targa.trim().toUpperCase();
          }

          payload.data_consegna = payload.data_consegna || (payload.stato === 'consegnato' ? (work.data_consegna || oggi()) : null);

          return isNew
            ? db.from('lavori').insert(payload)
            : db.from('lavori').update(payload).eq('id', work.id);
        },
        isNew ? null : () => db.from('lavori').delete().eq('id', work.id),
        'work-form-dialog'
      );
    }

    function openClientForm(cliente) {
      const isNew = !cliente.id;

      openModal(
        isNew ? 'Nuovo cliente' : 'Modifica cliente',
        [['nome', 'Nome'], ['cognome', 'Cognome'], ['telefono', 'Telefono', 'tel'], ['note', 'Note', 'area']],
        cliente,
        async (payload) => {
          return isNew
            ? db.from('clienti').insert(payload)
            : db.from('clienti').update(payload).eq('id', cliente.id);
        },
        isNew ? null : () => db.from('clienti').delete().eq('id', cliente.id)
      );
    }

    init();
