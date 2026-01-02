let API_URL = localStorage.getItem('pea_api_url') || "";
let barChartInstance = null;
let pieChartInstance = null;

// Stockage global pour faire la correspondance Ticker -> Nom Produit
let tickerToNameMap = {};
// Stockage global des transactions pour filtrage
let globalTransactions = [];
// Stockage global des Produit pour filtrage
let globalLive = {};

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
        
        // Stocker les transactions globalement
        globalTransactions = result.transactions || [];
        // Créer la map Ticker -> Nom à partir des données Live
        tickerToNameMap = {};
        if (result.live) {
            result.live.forEach(item => {
                const ticker = (item.ticker || "").toUpperCase().trim();
                const name = item.liste_produits || item.ticker;
                if (ticker) tickerToNameMap[ticker] = name;
            });
        }
        globalLive = result.live
        renderDashboard(result.transactions || [], result.live || [], globalTransactions);
    } catch (error) {
        statusEl.innerText = "Erreur Sync";
        console.warn("Erreur de récupération des données : ", error.message);
    }
}

/**
 * Éléments du Ticket de Caisse
 */
const getTicketElements = () => ({
    qte: document.getElementById('t_qte'),
    prix: document.getElementById('t_prix'),
    frais: document.getElementById('t_frais'),
    subtotal: document.getElementById('display-subtotal'),
    total: document.getElementById('display-total')
});

function updateTicketCalculations() {
    const els = getTicketElements();
    const qte = parseFloat(els.qte.value) || 0;
    const prix = parseFloat(els.prix.value) || 0;
    const frais = parseFloat(els.frais.value) || 0;
    
    const subtotalValue = qte * prix;
    const totalValue = subtotalValue + frais;

    if(els.subtotal) els.subtotal.textContent = subtotalValue.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
    if(els.total) els.total.textContent = totalValue.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}

function resetTicketDisplay() {
    const els = getTicketElements();
    if(els.subtotal) els.subtotal.textContent = "0,00 €";
    if(els.total) els.total.textContent = "0,00 €";
}

window.showProductHistory = function(ticker) {
    const modal = document.getElementById('productHistoryModal');
    const tbody = document.getElementById('modal-history-body');
    const title = document.getElementById('modal-history-title');
    
    if (!modal || !tbody) {
        console.error("Modal historique introuvable dans le DOM");
        return;
    }

    // Filtrer les transactions pour ce ticker
    const targetTicker = (ticker || "").toUpperCase().trim();
    const productTransactions = globalTransactions.filter(t => 
        (t.ticker || "").toUpperCase().trim() === targetTicker
    );
    
    // Trier par date décroissante (plus récent en haut)
    productTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Mettre à jour le titre
    const productName = tickerToNameMap[targetTicker] || targetTicker || "Produit Inconnu";
    if(title) title.textContent = `${productName}`;

    // Remplir le tableau
    tbody.innerHTML = "";
    if (productTransactions.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:20px;">Aucune transaction trouvée.</td></tr>`;
    } else {
        const displayName = tickerToNameMap[targetTicker] || targetTicker || "Inconnu";
        const cours = globalLive.flatMap(m => m.ticker === targetTicker ? [m.valeur_unitaire] : []);
        
        productTransactions.forEach(t => {
            //const perf = cours/(t.prix_unitaire+(t.frais/t.quantite))
            const perf = t.prix_unitaire > 0 ? ((cours - (t.prix_unitaire+(t.frais/t.quantite))) / (t.prix_unitaire+(t.frais/t.quantite))) * 100 : 0;
            const isPos = perf >= 0;
            const d = t.date ? new Date(t.date).toLocaleDateString('fr-FR') : "-";
            tbody.innerHTML += 
            `
            <tr class="transaction-row">
                    <td style = "text-align:center;">${d}</td>
                    <td style = "text-align:center;">${t.quantite}</td>
                    <td style = "text-align:center;">${formatEuro(t.prix_unitaire)}</td>
                    <td style="font-size: 0.8rem; color: var(--text-muted);text-align:center;">${t.frais > 0 ? formatEuro(t.frais) : '-'}</td>
                    <td style="text-align:center;">
                        <div style="font-weight: 1000; color: var(--text);">${formatEuro(t.total)}</div>
                        <div class="${isPos?'trend-up':'trend-down'}"style="font-weight:bold; font-size: 0.8rem;">${isPos ? '▲' : '▼'} ${Math.abs(perf).toFixed(2)}%</div>
                    </td>
                    
                </tr>
            `;
        });
    }

    modal.style.display = 'flex';
};

function setupEventListeners() {
    const openBtn = document.getElementById('openModalBtn');
    const closeBtn = document.getElementById('closeModalBtn');
    const form = document.getElementById('transactionForm');
    const closeHistoryBtn = document.getElementById('closeHistoryBtn'); // Nouveau bouton fermeture historique

    if(openBtn) {
        openBtn.addEventListener('click', () => {
            updateTickerDropdown();
            document.getElementById('transactionModal').style.display = 'flex';
            document.getElementById('t_date').valueAsDate = new Date();
            resetTicketDisplay(); // Remise à zéro visuelle
        });
    }
    
    if(closeBtn) {
        closeBtn.addEventListener('click', () => {
            document.getElementById('transactionModal').style.display = 'none';
        });
    }

    if (closeHistoryBtn) {
        closeHistoryBtn.addEventListener('click', () => {
            document.getElementById('productHistoryModal').style.display = 'none';
        });
    }

    // Fermer les modales si on clique en dehors (Overlay)
    window.onclick = function(event) {
        const transModal = document.getElementById('transactionModal');
        const histModal = document.getElementById('productHistoryModal');
        if (event.target == transModal) {
            transModal.style.display = "none";
        }
        if (event.target == histModal) {
            histModal.style.display = "none";
        }
    }

    if(form) {
        form.addEventListener('submit', handleFormSubmit);
        
        // Ajout des écouteurs pour le calcul dynamique en temps réel
        const els = getTicketElements();
        [els.qte, els.prix, els.frais].forEach(input => {
            if(input) input.addEventListener('input', updateTicketCalculations);
        });
    }

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
    const now = new Date();
    document.getElementById('last-update').innerText = "Dernière màj: " + now.toLocaleDateString('fr-FR') + " à " + now.toLocaleTimeString('fr-FR',{ hour: '2-digit', minute: '2-digit' });
    
    const historyBody = document.getElementById('table-body-history');
    if (historyBody) {
        historyBody.innerHTML = "";
        const sorted = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));
        
        sorted.forEach(t => {
            const d = t.date ? new Date(t.date).toLocaleDateString('fr-FR') : "-";
            const tickerKey = (t.ticker || "").toUpperCase().trim();
            const displayName = tickerToNameMap[tickerKey] || t.ticker || "Inconnu";
            const frais = t.frais;
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

    // 2. Dashboard - TRANSFORMATION EN CARTES
    const gridContainer = document.getElementById('positions-grid');
    if (gridContainer) {
        gridContainer.innerHTML = ""; // Clear existing content
        
        let totalActuel = 0;
        let totalInvesti = 0;
        let totaldiv = 0;
        let statsMois = {};
        let statsProduit = {};

        // Calculs préliminaires (identique à avant)
        transactions.forEach(t => {
            const val = cleanNumber(t.total);
            totalInvesti += val;
            const date = new Date(t.date);
            const label = date.toLocaleDateString('fr-FR', {month: 'short', year: '2-digit'});
            statsMois[label] = (statsMois[label] || 0) + val;
        });

        // Génération des cartes
        liveData.forEach(item => {
            const nom = item.liste_produits || "Autre";
            const sommeVal = cleanNumber(item.somme);
            const dividende = cleanNumber(item.dividende);
            totaldiv += dividende;
            totalActuel += sommeVal;
            statsProduit[nom] = (statsProduit[nom] || 0) + sommeVal;

            const am = cleanNumber(item.achat_moyen);
            const cours = cleanNumber(item.valeur_unitaire);
            // Perf = (Valeur Totale + Dividendes - Coût Total) / Coût Total
            const coutTotal = am * item.unité;
            const valeurTotale = (cours * item.unité) + dividende;
            const perf = coutTotal > 0 ? ((valeurTotale - coutTotal) / coutTotal) * 100 : 0;
            const isPos = perf >= 0;

            const diffCours = cours - am;
            const isDiffPos = diffCours >= 0;
            
            gridContainer.innerHTML += `
                <div class="position-card" onclick="showProductHistory('${item.ticker}')">
                    <!-- HEADER -->
                    <div class="pos-header" style="margin-bottom: 12px;">
                        <div class="pos-title-group">
                            <div class="pos-name">${nom}</div>
                            <div class="pos-ticker">${item.ticker || '---'}</div>
                        </div>
                        <div class="pos-perf-badge ${isPos ? 'perf-up' : 'perf-down'}">
                            ${isPos ? '▲' : '▼'} ${Math.abs(perf).toFixed(2)}%
                        </div>
                    </div>
                    
                    <!-- BODY : Calcul style Ticket de caisse -->
                    <div style="background-color: var(--bg); padding: 12px; border-radius: 8px; margin-bottom: 15px; border: 1px solid var(--border);">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                            <div class="pos-label" style="margin:0;">Valeur</div>
                            <div class="pos-value-main" style="font-size: 1rem;">${formatEuro(sommeVal)}</div>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                            <div class="pos-label" style="margin:0;">Dividendes</div>
                            <div class="pos-value-main" style="font-size: 1rem; color: var(--text-muted);">${dividende === 0 ? '-- €' : formatEuro(dividende)}</div>
                        </div>
                        
                        <div style="border-top: 1px dashed var(--text-muted); opacity: 0.3; margin: 8px 0;"></div>
                        
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div class="pos-label" style="margin:0; font-weight: 800; color: var(--text);">TOTAL</div>
                            <div class="pos-value-main" style="font-size: 1.1rem; color: var(--text);">${formatEuro(sommeVal + dividende)}</div>
                        </div>
                    </div>

                    <!-- FOOTER : Petit tableau de détails -->
                    <div class="pos-footer" style="display: grid; grid-template-columns: 1fr 1fr 1.2fr; gap: 5px; border-top: none; padding-top: 0;">
                        <div class="pos-stat">
                            <div class="pos-label">Unités</div>
                            <div class="pos-stat-val">${item.unité}</div>
                        </div>
                        <div class="pos-stat">
                            <div class="pos-label">Moyenne</div>
                            <div class="pos-stat-val">${formatEuro(item.achat_moyen)}</div>
                        </div>
                        <div class="pos-stat">
                            <div class="pos-label">Cours</div>
                            <div class="pos-stat-val" style="display: flex; flex-direction: column;">
                                <span>${formatEuro(cours)}</span>
                                <span style="font-size: 0.7rem; color: ${isDiffPos ? 'var(--up)' : 'var(--down)'}; font-weight: 700;">
                                    ${isDiffPos ? '+' : ''}${formatEuro(diffCours)}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });

        const gain = (totalActuel + totaldiv) - totalInvesti;
        const perfG = totalInvesti > 0 ? (gain / totalInvesti) * 100 : 0;

        document.getElementById('live-total').innerText = formatEuro(totalActuel);
        document.getElementById('total-investi-label-invest').innerText = "Capital Investi : " + formatEuro(totalInvesti-totaldiv);
        document.getElementById('total-investi-label-reinvest').innerText = "Dividendes Reçus : " + formatEuro(totaldiv);
        
        document.getElementById('total-gain').innerHTML = `<span class="${gain>=0?'trend-up':'trend-down'}" style="font-weight:800">${gain >= 0 ? "+" : ""}${formatEuro(gain)}</span>`;
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
                    label: 'Investi', 
                    data: Object.values(dataMois), 
                    backgroundColor: '#3b82f6',
                    borderRadius: 4
                }]
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false,
                plugins: { 
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    label += new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(context.parsed.y);
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: { 
                    y: { 
                        beginAtZero: true, 
                        grid: { display: false },
                        ticks: {
                            callback: function(value) {
                                return value + ' €';
                            }
                        }
                    } 
                }
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
                    label: 'Valeur',
                    backgroundColor: ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'],
                    borderWidth: 2,
                    borderColor: '#ffffff'
                }]
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                cutout: '65%',
                plugins: { 
                    legend: { position: 'bottom', labels: { boxWidth: 12, padding: 15, font: { size: 11 } } },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                let value = context.parsed;
                                
                                // Calcul du pourcentage
                                let total = context.dataset.data.reduce((a, b) => a + b, 0);
                                let percentage = total > 0 ? ((value / total) * 100).toFixed(2) : 0;

                                if (label) {
                                    label += ' : ';
                                }
                                
                                label += new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value);
                                label += ` (${percentage} %)`;
                                
                                return label;
                            }
                        }
                    }
                } 
            }
        });
    }
}