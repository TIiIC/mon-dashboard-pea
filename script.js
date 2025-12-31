let API_URL = localStorage.getItem('pea_api_url') || "";
let barChartInstance = null;
let pieChartInstance = null;

// Stockage global pour faire la correspondance Ticker -> Nom Produit
let tickerToNameMap = {};

document.addEventListener('DOMContentLoaded', () => {
    if (!API_URL) {
        showConfigModal();
    } else {
        fetchData();
    }
    setupEventListeners();
    setupTabs();
});

/**
 * Système d'onglets pour navigation fluide
 */
function setupTabs() {
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.getAttribute('data-tab');

            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            document.querySelectorAll('.tab-content').forEach(section => {
                section.classList.remove('active');
            });
            const targetSection = document.getElementById(`tab-${targetTab}`);
            if (targetSection) targetSection.classList.add('active');
        });
    });
}

function showConfigModal() {
    const url = prompt("Veuillez saisir l'URL de votre Google Apps Script :");
    if (url && url.includes("script.google.com")) {
        localStorage.setItem('pea_api_url', url);
        API_URL = url;
        fetchData();
    }
}

async function fetchWithRetry(url, options = {}, retries = 3) {
    try {
        const response = await fetch(url, options);
        if (options.mode !== 'no-cors' && !response.ok) throw new Error('Erreur réseau');
        return response;
    } catch (err) {
        if (retries > 0) {
            await new Promise(res => setTimeout(res, 1000));
            return fetchWithRetry(url, options, retries - 1);
        }
        throw err;
    }
}

async function fetchData() {
    const statusEl = document.getElementById('status');
    if (!API_URL) return;
    
    try {
        statusEl.innerText = "Sync...";
        const response = await fetchWithRetry(API_URL);
        const result = await response.json();
        statusEl.innerText = "À jour";
        
        // Créer la map Ticker -> Nom à partir des données Live
        tickerToNameMap = {};
        if (result.live) {
            result.live.forEach(item => {
                const ticker = (item.ticker || "").toUpperCase().trim();
                const name = item.liste_produits || item.ticker;
                if (ticker) tickerToNameMap[ticker] = name;
            });
        }

        renderDashboard(result.transactions || [], result.live || []);
    } catch (error) {
        statusEl.innerText = "Erreur Sync";
        console.warn("Erreur de récupération des données : ", error.message);
    }
}

function setupEventListeners() {
    document.getElementById('openModalBtn').addEventListener('click', () => {
        document.getElementById('transactionModal').style.display = 'flex';
        document.getElementById('t_date').valueAsDate = new Date();
    });
    
    document.getElementById('closeModalBtn').addEventListener('click', () => {
        document.getElementById('transactionModal').style.display = 'none';
    });

    document.getElementById('transactionForm').addEventListener('submit', handleFormSubmit);

    document.getElementById('status').addEventListener('dblclick', () => {
        const newUrl = prompt("Modifier l'URL de l'API ?", API_URL);
        if (newUrl) {
            localStorage.setItem('pea_api_url', newUrl);
            location.reload();
        }
    });
}

async function handleFormSubmit(e) {
    e.preventDefault();
    const btn = e.target.querySelector('.btn-submit');
    const originalText = btn.innerText;
    btn.innerText = "Traitement...";
    btn.disabled = true;

    const qte = parseFloat(document.getElementById('t_qte').value);
    const prix = parseFloat(document.getElementById('t_prix').value);
    const frais = parseFloat(document.getElementById('t_frais').value) || 0;
    const nom = document.getElementById('t_ticker').value;

    const data = {
        date: document.getElementById('t_date').value,
        ticker: document.getElementById('t_ticker').value.toUpperCase().trim(),
        quantite: qte,
        prix: prix,
        frais: frais,
        total: (qte * prix) + frais,
        nom: nom
    };

    try {
        await fetch(API_URL, { 
            method: 'POST', 
            mode: 'no-cors', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data) 
        });
        
        document.getElementById('transactionModal').style.display = 'none';
        e.target.reset();
        document.getElementById('status').innerText = "Enregistré !";
        setTimeout(fetchData, 2000); 
    } catch (error) {
        console.error("Erreur d'envoi :", error);
        alert("Erreur lors de l'enregistrement.");
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

function cleanNumber(val) {
    if (val === undefined || val === null) return 0;
    return parseFloat(val.toString().replace(',', '.')) || 0;
}

function formatEuro(val) {
    return cleanNumber(val).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}

function renderDashboard(transactions, liveData) {
    document.getElementById('last-update').innerText = "Dernière màj: " + new Date().toLocaleDateString('fr-FR')+" à "+new Date().toLocaleTimeString('fr-FR');
    
    // 1. Historique (Amélioré avec Noms de Produits)
    const historyBody = document.getElementById('table-body-history');
    if (historyBody) {
        historyBody.innerHTML = "";
        const sorted = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));
        
        sorted.forEach(t => {
            const d = t.date ? new Date(t.date).toLocaleDateString('fr-FR') : "-";
            const tickerKey = (t.ticker || "").toUpperCase().trim();
            const displayName = tickerToNameMap[tickerKey] || t.ticker || "Inconnu";
            const frais = t.frais;
            //const cours = liveData.map(m => m.ticker===t.ticker ? m.valeur_unitaire : 0).filter(val => val !== 0);
            const cours = liveData.flatMap(m => m.ticker === t.ticker ? [m.valeur_unitaire] : []);

            historyBody.innerHTML += `
                <tr class="transaction-row">
                    <td>${d}</td>
                    <td>
                        <div style="font-weight: 600; color: var(--text);">${displayName}</div>
                        <div style="font-size: 0.7rem; color: var(--text-muted); font-family: monospace;">${tickerKey}</div>
                    </td>
                    <td>${t.quantite}</td>
                    <td>${formatEuro(t.prix_unitaire)}</td>
                    <td style="font-size: 0.8rem; color: var(--text-muted);">${frais > 0 ? formatEuro(frais) : '-'}</td>
                    <td>
                        <div style="font-weight: 1000; color: var(--text);">${formatEuro(t.total)}</div>
                        <div style="font-weight: 200; font-size: 0.8rem; color: var(--text-muted);"> Cours : ${formatEuro(cours)}</div>
                        <div class="${cours/t.prix_unitaire>=1?'trend-up':'trend-down'}"style="font-weight:bold; font-size: 0.8rem;">${cours-t.prix_unitaire>0? '+' : ''}${((cours/(t.prix_unitaire+(frais/t.quantite))-1)*100).toFixed(1)}%</div>
                    </td>
                    
                </tr>
            `;
        });
    }

    // 2. Dashboard
    const liveBody = document.getElementById('table-body-live');
    if (liveBody) {
        liveBody.innerHTML = "";
        
        let totalActuel = 0;
        let totalInvesti = 0;
        let totaldiv = 0;
        let statsMois = {};
        let statsProduit = {};

        transactions.forEach(t => {
            const val = cleanNumber(t.total);
            totalInvesti += val;
            const date = new Date(t.date);
            const label = date.toLocaleDateString('fr-FR', {month: 'short', year: '2-digit'});
            statsMois[label] = (statsMois[label] || 0) + val;
        });

        liveData.forEach(item => {
            const nom = item.liste_produits || "Autre";
            const sommeVal = cleanNumber(item.somme);
            const dividende = cleanNumber(item.dividende);
            totaldiv += dividende;
            totalActuel += sommeVal;
            statsProduit[nom] = (statsProduit[nom] || 0) + sommeVal;

            const am = cleanNumber(item.achat_moyen);
            const cours = cleanNumber(item.valeur_unitaire);
            const perf = am > 0 ? (((cours*item.unité+dividende) - am*item.unité) / (am*item.unité)) * 100 : 0;

            liveBody.innerHTML += `
                <tr>
                    <td>
                        <div style="font-weight: bold;">${nom}</div>
                        <div style="font-size: 0.7rem; color: var(--text-muted);">${item.ticker || ''}</div>
                    </td>
                    <td>${item.unité}</td>
                    <td>${formatEuro(item.achat_moyen)}</td>
                    <td>
                        <div class="${cours/item.achat_moyen>=1?'trend-up':'trend-down'}"style="font-weight:bold">${formatEuro(cours)}</div>
                        <div class="${cours/item.achat_moyen>=1?'trend-up':'trend-down'}"style="font-weight:bold">${cours-item.achat_moyen>0? '+' : ''}${formatEuro(cours-item.achat_moyen)}</div>
                    </td>
                    <td>${formatEuro(sommeVal)}</td>
                    <td>${formatEuro(dividende)}</td>
                    <td class="${perf>=0?'trend-up':'trend-down'}" style="font-weight:bold">${perf > 0 ? '+' : ''}${perf.toFixed(1)}%</td>
                </tr>
            `;
        });
        
        const gain = totalActuel - totalInvesti + totaldiv;
        const perfG = totalInvesti-totaldiv > 0 ? (gain / (totalInvesti-totaldiv)) * 100 : 0;

        document.getElementById('live-total').innerText = formatEuro(totalActuel);
        document.getElementById('total-investi-label-invest').innerText = "Capital Investi: " + formatEuro(totalInvesti-totaldiv);
        document.getElementById('total-investi-label-reinvest').innerText = "Capital Re-investi: " + formatEuro(totaldiv);
        document.getElementById('total-gain').innerHTML = `<span class="${gain>=0?'trend-up':'trend-down'}" style="font-weight:1000">${gain >= 0 ? "+" : ""}${formatEuro(gain)}</span>`;
        document.getElementById('live-perf-global').innerHTML = `<span class="${gain>=0?'trend-up':'trend-down'}" style="font-weight:bold">${gain >= 0 ? "+" : ""}${perfG.toFixed(2)}%</span>`;

        updateCharts(statsMois, statsProduit);
    }
}
function updateTickerDropdown() {
            const select = document.getElementById('t_ticker');
            select.innerHTML = '<option value="" disabled selected>Choisir un actif...</option>';
            
            // On utilise la variable globale tickerToNameMap définie dans script.js
            if (typeof tickerToNameMap !== 'undefined') {
                // Détection auto si c'est un Objet ou une Map
                const isMap = tickerToNameMap instanceof Map;
                const tickers = isMap ? Array.from(tickerToNameMap.keys()) : Object.keys(tickerToNameMap);

                tickers.sort().forEach(ticker => {
                    const name = isMap ? tickerToNameMap.get(ticker) : tickerToNameMap[ticker];
                    const option = document.createElement('option');
                    option.value = name;
                    option.textContent = name ? `${name} - ${ticker}` : ticker;
                    select.appendChild(option);
                });
            } else {
                console.warn("La variable tickerToNameMap est introuvable dans script.js");
                const option = document.createElement('option');
                option.disabled = true;
                option.textContent = "Erreur: Liste introuvable";
                select.appendChild(option);
            }
        }

        // Gestion de l'affichage de la modal
        document.getElementById('openModalBtn').addEventListener('click', () => {
            updateTickerDropdown();
            document.getElementById('transactionModal').style.display = 'flex';
        });
        
        document.getElementById('closeModalBtn').addEventListener('click', () => {
            document.getElementById('transactionModal').style.display = 'none';
        });
function updateCharts(dataMois, dataProduit) {
    const bCtx = document.getElementById('barChart');
    if (bCtx && bCtx.getContext) {
        if (barChartInstance) barChartInstance.destroy();
        barChartInstance = new Chart(bCtx.getContext('2d'), {
            type: 'bar',
            data: { 
                labels: Object.keys(dataMois), 
                datasets: [{ 
                    label: 'Investi (€)', 
                    data: Object.values(dataMois), 
                    backgroundColor: '#3b82f6',
                    borderRadius: 4
                }]
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, grid: { display: false } } }
            }
        });
    }

    const pCtx = document.getElementById('pieChart');
    if (pCtx && pCtx.getContext) {
        if (pieChartInstance) pieChartInstance.destroy();
        pieChartInstance = new Chart(pCtx.getContext('2d'), {
            type: 'doughnut',
            data: { 
                labels: Object.keys(dataProduit), 
                datasets: [{ 
                    data: Object.values(dataProduit), 
                    backgroundColor: ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'],
                    borderWidth: 2,
                    borderColor: '#ffffff'
                }]
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                cutout: '65%',
                plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, padding: 15, font: { size: 11 } } } } 
            }
        });
    }
}