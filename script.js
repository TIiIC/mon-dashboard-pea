/**
 * CONFIGURATION SÉCURISÉE
 * L'URL n'est pas stockée dans le code pour permettre un dépôt public.
 */
let API_URL = localStorage.getItem('pea_api_url') || "";

let barChartInstance = null;
let pieChartInstance = null;
let tickerMapping = {}; 

document.addEventListener('DOMContentLoaded', () => {
    if (!API_URL) {
        showConfigModal();
    } else {
        fetchData();
    }
    setupEventListeners();
});

/**
 * Affiche une fenêtre pour saisir l'URL de l'API (la première fois)
 */
function showConfigModal() {
    const url = prompt("Veuillez saisir l'URL de votre Google Apps Script (https://script.google.com/...) :");
    if (url && url.includes("script.google.com")) {
        localStorage.setItem('pea_api_url', url);
        API_URL = url;
        fetchData();
    } else {
        const statusEl = document.getElementById('status');
        if (statusEl) statusEl.innerText = "⚠️ URL API manquante ou invalide.";
    }
}

/**
 * Permet de réinitialiser l'URL si besoin (ex: erreur de saisie)
 */
function resetConfig() {
    if (confirm("Voulez-vous modifier l'URL de l'API ?")) {
        localStorage.removeItem('pea_api_url');
        location.reload();
    }
}

async function fetchData() {
    const statusEl = document.getElementById('status');
    if (!API_URL) return;
    
    try {
        statusEl.innerText = "Connexion au serveur...";
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error("Réponse serveur non valide");
        
        const result = await response.json();
        statusEl.innerText = "Données à jour";
        renderDashboard(result.transactions || [], result.live || []);
    } catch (error) {
        statusEl.innerText = "Erreur de connexion";
        console.error("Erreur Fetch:", error);
    }
}

function setupEventListeners() {
    const openBtn = document.getElementById('openModalBtn');
    const closeBtn = document.getElementById('closeModalBtn');
    const form = document.getElementById('transactionForm');
    const modal = document.getElementById('transactionModal');
    
    // Ajout d'un bouton de reset si vous cliquez sur le statut
    const statusEl = document.getElementById('status');
    if (statusEl) statusEl.addEventListener('dblclick', resetConfig);

    if (openBtn) openBtn.addEventListener('click', openModal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    window.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    if (form) form.addEventListener('submit', handleFormSubmit);
}

function openModal() {
    const modal = document.getElementById('transactionModal');
    if (modal) {
        modal.style.display = 'flex';
        document.getElementById('t_date').valueAsDate = new Date();
        updateTickerDatalist();
    }
}

function closeModal() {
    const modal = document.getElementById('transactionModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function updateTickerDatalist() {
    const tickerInput = document.getElementById('t_ticker');
    let datalist = document.getElementById('tickers_list');
    if (tickerInput) tickerInput.setAttribute('list', 'tickers_list');
    
    if (datalist) {
        datalist.innerHTML = ""; 
        Object.keys(tickerMapping).forEach(ticker => {
            const option = document.createElement('option');
            option.value = ticker;
            option.label = tickerMapping[ticker]; 
            datalist.appendChild(option);
        });
    }
}

async function handleFormSubmit(e) {
    e.preventDefault();
    const btn = e.target.querySelector('.btn-submit');
    const originalText = btn.innerText;
    btn.innerText = "Envoi...";
    btn.disabled = true;

    const ticker = document.getElementById('t_ticker').value.toUpperCase().trim();
    const qte = parseFloat(document.getElementById('t_qte').value);
    const prix = parseFloat(document.getElementById('t_prix').value);
    const frais = parseFloat(document.getElementById('t_frais').value) || 0;

    const data = {
        date: document.getElementById('t_date').value,
        ticker: ticker,
        type: tickerMapping[ticker] || ticker,
        quantite: qte,
        prix: prix,
        frais: frais,
        total: (qte * prix) + frais
    };

    try {
        await fetch(API_URL, { 
            method: 'POST', 
            mode: 'no-cors', 
            cache: 'no-cache',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data) 
        });
        
        closeModal();
        e.target.reset();
        setTimeout(fetchData, 2000); 
    } catch (error) {
        console.error("Erreur d'envoi:", error);
        alert("Erreur lors de l'enregistrement.");
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

function cleanNumber(val) {
    if (val === undefined || val === null || val === "") return 0;
    if (typeof val === 'number') return val;
    return parseFloat(val.toString().replace(/\s/g, '').replace(',', '.').replace(/[^0-9.-]/g, '')) || 0;
}

function formatEuro(val) {
    return cleanNumber(val).toLocaleString('fr-FR', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 2
    });
}

function renderDashboard(transactions, liveData) {
    const tableBody = document.getElementById('table-body');
    if (!tableBody) return;
    
    tableBody.innerHTML = "";
    document.getElementById('last-update').innerText = new Date().toLocaleString('fr-FR');
    
    let cumulTransactions = 0;
    let valeurActuelleTotale = 0;
    let totalDividendes = 0;
    
    tickerMapping = {};

    transactions.forEach(t => {
        const valTotal = cleanNumber(t.total);
        cumulTransactions += valTotal;
        if (t.ticker && t.type) {
            tickerMapping[t.ticker.toUpperCase().trim()] = t.type;
        }
    });

    const statsMois = {};
    transactions.forEach(t => {
        const date = new Date(t.date);
        const label = !isNaN(date.getTime()) ? date.toLocaleDateString('fr-FR', {month: 'short', year: 'numeric'}) : "Inconnu";
        statsMois[label] = (statsMois[label] || 0) + cleanNumber(t.total);
    });

    const statsProduit = {};
    liveData.forEach(item => {
        const ticker = (item.ticker || "").toUpperCase().trim();
        if (!ticker) return;

        const nomComplet = item.liste_produits || tickerMapping[ticker] || ticker;
        tickerMapping[ticker] = nomComplet;

        const qte = cleanNumber(item.unité);
        const cours = cleanNumber(item.valeur_unitaire);
        const somme = cleanNumber(item.somme);
        const am = cleanNumber(item.achat_moyen);
        const div = cleanNumber(item.dividende);
        
        const varPru = am > 0 ? ((cours - am) / am) * 100 : 0;
        const gainTotal = (somme + div) - (qte * am);
        const perfTotal = (qte * am) > 0 ? (gainTotal / (qte * am)) * 100 : 0;

        valeurActuelleTotale += somme;
        totalDividendes += div;
        statsProduit[nomComplet] = somme;

        tableBody.innerHTML += `
            <tr>
                <td><strong>${nomComplet}</strong><br><small style="color:var(--text-muted)">${ticker}</small></td>
                <td>${qte}</td>
                <td>${formatEuro(am)}<br><small class="${varPru>=0?'trend-up':'trend-down'}">${varPru>=0?'+':''}${varPru.toFixed(2)}%</small></td>
                <td>${formatEuro(cours)}</td>
                <td>${formatEuro(somme)}</td>
                <td class="${perfTotal>=0?'trend-up':'trend-down'}"><strong>${perfTotal>=0?'+':''}${perfTotal.toFixed(2)}%</strong><br><small>(${formatEuro(gainTotal)})</small></td>
            </tr>
        `;
    });

    const totalInvestiNet = cumulTransactions - totalDividendes;
    const gainAbsolu = valeurActuelleTotale - totalInvestiNet;
    const perfGlobal = totalInvestiNet > 0 ? (gainAbsolu / totalInvestiNet) * 100 : 0;

    document.getElementById('live-total').innerText = formatEuro(valeurActuelleTotale);
    document.getElementById('total-investi').innerText = formatEuro(totalInvestiNet);
    document.getElementById('total-gain').innerText = formatEuro(gainAbsolu);
    document.getElementById('total-gain').className = "value " + (gainAbsolu >= 0 ? "trend-up" : "trend-down");
    document.getElementById('div-subtext').innerText = `+${formatEuro(totalDividendes)} dividendes réinvestis`;
    document.getElementById('live-perf-global').innerHTML = `<span class="${gainAbsolu>=0?'trend-up':'trend-down'}">${gainAbsolu>=0?'+':''}${perfGlobal.toFixed(2)}%</span>`;

    updateCharts(statsMois, statsProduit);
}

function updateCharts(dataMois, dataProduit) {
    const barCtx = document.getElementById('barChart');
    if (barCtx) {
        if (barChartInstance) barChartInstance.destroy();
        barChartInstance = new Chart(barCtx.getContext('2d'), {
            type: 'bar',
            data: { labels: Object.keys(dataMois), datasets: [{ label: 'Investi (€)', data: Object.values(dataMois), backgroundColor: '#2563eb' }]},
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    const pieCtx = document.getElementById('pieChart');
    if (pieCtx) {
        if (pieChartInstance) pieChartInstance.destroy();
        pieChartInstance = new Chart(pieCtx.getContext('2d'), {
            type: 'doughnut',
            data: { labels: Object.keys(dataProduit), datasets: [{ data: Object.values(dataProduit), backgroundColor: ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'] }]},
            options: { responsive: true, maintainAspectRatio: false }
        });
    }
}