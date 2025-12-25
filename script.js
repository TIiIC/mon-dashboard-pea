let API_URL = localStorage.getItem('pea_api_url') || "";
let barChartInstance = null;
let pieChartInstance = null;

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
 * Logique des onglets : Bascule entre les sections main
 */
function setupTabs() {
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.getAttribute('data-tab');

            // Mise à jour visuelle des boutons d'onglets
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Masquer tout le contenu et afficher le contenu cible
            document.querySelectorAll('.tab-content').forEach(section => {
                section.classList.remove('active');
            });
            document.getElementById(`tab-${targetTab}`).classList.add('active');
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
        if (!response.ok) throw new Error('Network error');
        return response;
    } catch (err) {
        if (retries > 0) return fetchWithRetry(url, options, retries - 1);
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
        renderDashboard(result.transactions || [], result.live || []);
    } catch (error) {
        statusEl.innerText = "Erreur";
        console.error(error);
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

    // Double clic sur le statut pour changer l'URL de l'API
    document.getElementById('status').addEventListener('dblclick', () => {
        const newUrl = prompt("Nouvelle URL API ?", API_URL);
        if (newUrl) {
            localStorage.setItem('pea_api_url', newUrl);
            location.reload();
        }
    });
}

async function handleFormSubmit(e) {
    e.preventDefault();
    const btn = e.target.querySelector('.btn-submit');
    btn.innerText = "Envoi...";
    btn.disabled = true;

    const qte = parseFloat(document.getElementById('t_qte').value);
    const prix = parseFloat(document.getElementById('t_prix').value);
    const frais = parseFloat(document.getElementById('t_frais').value) || 0;

    const data = {
        date: document.getElementById('t_date').value,
        ticker: document.getElementById('t_ticker').value.toUpperCase(),
        quantite: qte,
        prix: prix,
        frais: frais,
        total: (qte * prix) + frais,
        type: "ACHAT"
    };

    try {
        await fetch(API_URL, { 
            method: 'POST', 
            mode: 'no-cors', 
            body: JSON.stringify(data) 
        });
        document.getElementById('transactionModal').style.display = 'none';
        e.target.reset();
        setTimeout(fetchData, 1500); 
    } catch (error) {
        alert("Erreur réseau");
    } finally {
        btn.innerText = "Valider";
        btn.disabled = false;
    }
}

function cleanNumber(val) {
    if (!val) return 0;
    return parseFloat(val.toString().replace(',', '.')) || 0;
}

function formatEuro(val) {
    return cleanNumber(val).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}

function renderDashboard(transactions, liveData) {
    document.getElementById('last-update').innerText = "Màj: " + new Date().toLocaleTimeString('fr-FR');
    
    // 1. Remplissage Historique (Onglet Transactions)
    const historyBody = document.getElementById('table-body-history');
    historyBody.innerHTML = "";
    const sorted = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));
    
    sorted.forEach(t => {
        const d = t.date ? new Date(t.date).toLocaleDateString('fr-FR') : "-";
        historyBody.innerHTML += `
            <tr>
                <td>${d}</td>
                <td><strong>${t.ticker}</strong></td>
                <td>${t.quantite}</td>
                <td>${formatEuro(t.prix)}</td>
                <td>${formatEuro(t.total)}</td>
            </tr>
        `;
    });

    // 2. Remplissage Dashboard (Onglet Résumé)
    const liveBody = document.getElementById('table-body-live');
    liveBody.innerHTML = "";
    
    let totalActuel = 0;
    let totalInvesti = 0;
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
        const nom = item.liste_produits || item.ticker || "Inconnu";
        const sommeVal = cleanNumber(item.somme);
        totalActuel += sommeVal;
        statsProduit[nom] = sommeVal;

        const am = cleanNumber(item.achat_moyen);
        const cours = cleanNumber(item.valeur_unitaire);
        const perf = am > 0 ? ((cours - am) / am) * 100 : 0;

        liveBody.innerHTML += `
            <tr>
                <td><strong>${nom}</strong></td>
                <td>${item.unité}</td>
                <td>${formatEuro(cours)}</td>
                <td>${formatEuro(sommeVal)}</td>
                <td class="${perf>=0?'trend-up':'trend-down'}">${perf.toFixed(1)}%</td>
            </tr>
        `;
    });

    const gain = totalActuel - totalInvesti;
    const perfG = totalInvesti > 0 ? (gain / totalInvesti) * 100 : 0;

    document.getElementById('live-total').innerText = formatEuro(totalActuel);
    document.getElementById('total-investi-label').innerText = "Investi: " + formatEuro(totalInvesti);
    document.getElementById('total-gain').innerText = formatEuro(gain);
    document.getElementById('total-gain').className = "value " + (gain >= 0 ? "trend-up" : "trend-down");
    document.getElementById('live-perf-global').innerHTML = `<span class="${gain>=0?'trend-up':'trend-down'}">${perfG.toFixed(2)}%</span>`;

    updateCharts(statsMois, statsProduit);
}

function updateCharts(dataMois, dataProduit) {
    const bCtx = document.getElementById('barChart').getContext('2d');
    if (barChartInstance) barChartInstance.destroy();
    barChartInstance = new Chart(bCtx, {
        type: 'bar',
        data: { 
            labels: Object.keys(dataMois), 
            datasets: [{ 
                label: 'Investissements', 
                data: Object.values(dataMois), 
                backgroundColor: '#2563eb',
                borderRadius: 5
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    const pCtx = document.getElementById('pieChart').getContext('2d');
    if (pieChartInstance) pieChartInstance.destroy();
    pieChartInstance = new Chart(pCtx, {
        type: 'doughnut',
        data: { 
            labels: Object.keys(dataProduit), 
            datasets: [{ 
                data: Object.values(dataProduit), 
                backgroundColor: ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'] 
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
}