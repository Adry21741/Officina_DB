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
    let tab = 'lavori';
    let filtro = 'attivi';
    let q = '';
    let clienti = [];
    let lavori = [];

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
      $('#app').innerHTML = `
        <h1>Officina di Casa</h1>
        <p class="mu">Accedi con l’utente creato in Supabase.</p>
        <form id="login-form">
          <label>Email
            <input name="email" type="email" autocomplete="username" required>
          </label>
          <label>Password
            <input name="password" type="password" autocomplete="current-password" required>
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
        const { error } = await db.auth.signInWithPassword(formData);
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
        toast('Errore: ' + error.message);
        return;
      }

      clienti = clientiResult.data;
      lavori = lavoriResult.data;
      renderShell();
    }

    function renderShell() {
      $('#app').innerHTML = `
        <header>
          <h1>Officina di Casa</h1>
          <button class="ghost" id="logout">Esci</button>
        </header>
        <div class="tabs">
          <button data-t="lavori">Lavori</button>
          <button data-t="clienti">Clienti</button>
        </div>
        <div id="bar"></div>
        <div id="list"></div>
        <button class="fab" id="add" aria-label="Aggiungi">+</button>
      `;

      $('#logout').onclick = async () => {
        await db.auth.signOut();
        renderLogin();
      };

      $('#add').onclick = () => {
        tab === 'lavori' ? openWorkForm({}) : openClientForm({});
      };

      document.querySelectorAll('.tabs button').forEach((button) => {
        button.classList.toggle('on', button.dataset.t === tab);
        button.onclick = () => {
          tab = button.dataset.t;
          q = '';
          renderShell();
        };
      });

      $('#list').onchange = async (event) => {
        const field = event.target;
        const id = field.dataset.id;
        if (!id) return;

        const stato = field.value;
        const data_consegna = stato === 'consegnato' ? oggi() : null;
        const { error } = await db.from('lavori').update({ stato, data_consegna }).eq('id', id);

        if (error) {
          toast(error.message);
          return;
        }

        const lavoro = lavori.find((item) => item.id === id);
        if (lavoro) {
          Object.assign(lavoro, { stato, data_consegna });
        }

        renderList();
      };

      $('#list').onclick = (event) => {
        const button = event.target.closest('button');
        if (!button) return;

        if (button.dataset.e) {
          const job = lavori.find((item) => item.id === button.dataset.e);
          openWorkForm(job);
        }

        if (button.dataset.c) {
          const cliente = clienti.find((item) => item.id === button.dataset.c);
          openClientForm(cliente);
        }
      };

      renderToolbar();
      renderList();
    }

    function renderToolbar() {
      const filters = tab === 'lavori'
        ? `<div class="chips">${FILT.map(([key, label]) => `<button data-f="${key}" class="${key === filtro ? 'on' : ''}">${label}</button>`).join('')}</div>`
        : '';

      $('#bar').innerHTML = filters + `<label><input id="q" type="search" placeholder="Cerca" value="${esc(q)}"></label>`;

      document.querySelectorAll('[data-f]').forEach((button) => {
        button.onclick = () => {
          filtro = button.dataset.f;
          renderToolbar();
          renderList();
        };
      });

      $('#q').oninput = (event) => {
        q = event.target.value;
        renderList();
      };
    }

    function renderList() {
      const searchText = q.trim().toLowerCase();
      const findClienteById = (clienteId) => clienti.find((cliente) => cliente.id === clienteId);
      let html = '';

      if (tab === 'lavori') {
        const filteredJobs = lavori.filter((job) => {
          const matchesFilter = filtro === 'tutti' || (filtro === 'attivi' ? job.stato !== 'consegnato' : job.stato === filtro);
          const searchable = [job.targa, job.veicolo, job.descrizione, findClienteById(job.cliente_id)?.nome].join(' ').toLowerCase();
          const matchesSearch = !searchText || searchable.includes(searchText);
          return matchesFilter && matchesSearch;
        });

        html = filteredJobs.map((job) => {
          const cliente = findClienteById(job.cliente_id);
          return `
            <div class="card" style="--c:var(${COL[job.stato]})">
              <div class="top">
                <span class="plate">${esc(job.targa || '—')}</span>
                <strong>${eur(job.importo)}</strong>
              </div>
              <div style="margin:6px 0 2px">
                <strong>${esc(job.veicolo)}</strong>${cliente ? ' · ' + esc(cliente.nome) : ''}
              </div>
              <div>${esc(job.descrizione)}</div>
              <div class="mu">Ingresso ${job.data_ingresso ? job.data_ingresso.split('-').reverse().join('/') : '—'}</div>
              <div class="top" style="margin-top:8px">
                <select class="st" data-id="${job.id}" aria-label="Stato">
                  ${STATI.map(([key, label]) => `<option value="${key}"${key === job.stato ? ' selected' : ''}>${label}</option>`).join('')}
                </select>
                <button class="ghost" data-e="${job.id}">Modifica</button>
              </div>
            </div>
          `;
        }).join('');
      } else {
        html = clienti.filter((cliente) => !searchText || [cliente.nome, cliente.telefono].join(' ').toLowerCase().includes(searchText))
          .map((cliente) => `
            <div class="card">
              <div class="top">
                <strong>${esc(cliente.nome)}</strong>
                <button class="ghost" data-c="${cliente.id}">Modifica</button>
              </div>
              ${cliente.telefono ? `<a href="tel:${esc(cliente.telefono)}">${esc(cliente.telefono)}</a>` : ''}
              <div class="mu">${esc(cliente.note)}</div>
            </div>
          `).join('');
      }

      $('#list').innerHTML = html || '<div class="empty">Niente da mostrare. Tocca + per aggiungere.</div>';
    }

    function openModal(title, fields, values, saveAction, deleteAction) {
      const dialog = $('#dlg');
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

            if (type === 'area') {
              return `
                <label>${label}
                  <textarea name="${key}" rows="3"${requiredFields.includes(key) ? ' required' : ''}>${esc(values[key])}</textarea>
                </label>
              `;
            }

            return `
              <label>${label}
                <input name="${key}" type="${type || 'text'}"${type === 'number' ? ' step="any"' : ''} value="${esc(values[key])}"${requiredFields.includes(key) ? ' required' : ''}>
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

        const { error } = await saveAction(formData);
        if (error) {
          toast(error.message);
          return;
        }

        dialog.close();
        loadData();
      };

      dialog.showModal();
    }

    function openWorkForm(work) {
      const isNew = !work.id;
      const current = isNew ? { stato: 'da_fare', data_ingresso: oggi() } : work;

      openModal(
        isNew ? 'Nuovo lavoro' : 'Modifica lavoro',
        [
          ['targa', 'Targa'],
          ['veicolo', 'Veicolo (marca e modello)'],
          ['cliente_id', 'Cliente', 'select', [['', 'Nessuno'], ...clienti.map((cliente) => [cliente.id, cliente.nome])]],
          ['descrizione', 'Lavoro da fare', 'area'],
          ['stato', 'Stato', 'select', STATI],
          ['importo', 'Importo (€)', 'number'],
          ['data_ingresso', 'Data ingresso', 'date'],
          ['note', 'Note', 'area']
        ],
        current,
        async (payload) => {
          if (payload.targa) {
            payload.targa = payload.targa.trim().toUpperCase();
          }

          payload.data_consegna = payload.stato === 'consegnato' ? (work.data_consegna || oggi()) : null;

          return isNew
            ? db.from('lavori').insert(payload)
            : db.from('lavori').update(payload).eq('id', work.id);
        },
        isNew ? null : () => db.from('lavori').delete().eq('id', work.id)
      );
    }

    function openClientForm(cliente) {
      const isNew = !cliente.id;

      openModal(
        isNew ? 'Nuovo cliente' : 'Modifica cliente',
        [['nome', 'Nome'], ['telefono', 'Telefono', 'tel'], ['note', 'Note', 'area']],
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
