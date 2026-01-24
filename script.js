/**
 * CONFIGURATION & VARIABLES GLOBALES
 */
let API_URL = localStorage.getItem('pea_api_url') || "";
let barChartInstance = null;
let pieChartInstance = null;
let cumulativeChartInstance = null;
let dividendChartInstance = null;

// Stockage global
let tickerToNameMap = {};       // Correspondance Ticker -> Nom
let globalTransactions = [];    // Historique des achats
let globalDividendes = [];      // Historique des dividendes
let globalPlan = [];            // Plans d'investissement
let globalLive = {};            // Données temps réel reconstruites
let displayedTransactions = []; // Transactions affichées (pour modales)

// Configuration UI/Graphiques
let monthlyObjective = localStorage.getItem('pea_monthly_objective') ? 
    parseFloat(localStorage.getItem('pea_monthly_objective')) : 500;
let activePeriod = '1m';
let customDateRange = { start: null, end: null }; 

// Variables de synchronisation historique
let missingHistories = [];  
let mismatchedHistories = []; 

/**
 * INITIALISATION
 */
document.addEventListener('DOMContentLoaded', () => {
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
    
    // Configuration globale Chart.js pour le style
    setupChartDefaults();

    if (!API_URL) {
        showConfigModal();
    } else {
        // 1. Affichage optimiste (Cache)
        loadCachedData();
        // 2. Synchronisation (Réseau)
        fetchData();
    }
    setupEventListeners();
    setupTabs();
    initDividendes(); 
});

/**
 * STYLE CHARTS (HARMONISATION)
 */
function setupChartDefaults() {
    const root = getComputedStyle(document.documentElement);
    const textColor = root.getPropertyValue('--text-muted').trim();
    const borderColor = root.getPropertyValue('--border').trim();
    const fontFamily = "'Inter', sans-serif";

    Chart.defaults.font.family = fontFamily;
    Chart.defaults.color = textColor;
    Chart.defaults.scale.grid.color = borderColor;
    Chart.defaults.scale.grid.borderColor = 'transparent'; // Cache la bordure des axes
    Chart.defaults.plugins.tooltip.backgroundColor = root.getPropertyValue('--card').trim();
    Chart.defaults.plugins.tooltip.titleColor = root.getPropertyValue('--text').trim();
    Chart.defaults.plugins.tooltip.bodyColor = root.getPropertyValue('--text-muted').trim();
    Chart.defaults.plugins.tooltip.borderColor = borderColor;
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.padding = 12;
    Chart.defaults.plugins.tooltip.cornerRadius = 8;
    Chart.defaults.plugins.tooltip.displayColors = true;
}

/**
 * UTILS & HELPERS GÉNÉRAUX
 */

function cleanNumber(val) {
    if (val === undefined || val === null) return 0;
    return parseFloat(val.toString().replace(',', '.')) || 0;
}

function parseDividende(divString) {
    if (!divString) return 0;
    const cleaned = divString.toString().replace(/[€\s]/g, '').replace(',', '.').trim();
    return parseFloat(cleaned) || 0;
}

function formatEuro(val) {
    return cleanNumber(val).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}

function formatDate(dateStr) {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function showLoader(text = "Chargement...") {
    const loader = document.getElementById('global-loader');
    const textEl = document.getElementById('loader-text');
    if (loader) {
        if(textEl) textEl.innerText = text;
        loader.style.display = 'flex';
    }
}

function hideLoader() {
    const loader = document.getElementById('global-loader');
    if (loader) loader.style.display = 'none';
}

/**
 * GESTION DES DONNÉES (API & CACHE)
 */

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

    const isSilent = document.getElementById('table-body-history').innerHTML !== "";
    if (!isSilent) showLoader("Synchronisation...");

    try {
        statusEl.innerText = (statusEl.innerText !== "Mémoire") ? "Sync..." : "Sync...";

        const response = await fetchWithRetry(API_URL);
        const result = await response.json();
        
        localStorage.setItem('pea_data_cache', JSON.stringify(result));
        statusEl.innerText = "À jour";
        statusEl.style.color = "var(--up)";
        
        processData(result);
    } catch (error) {
        if (globalTransactions.length > 0) {
            statusEl.innerText = "Hors Ligne";
            statusEl.style.color = "var(--text-muted)";
        } else {
            statusEl.innerText = "Erreur";
            statusEl.style.color = "var(--down)";
        }
        console.warn("Erreur API : ", error.message);
    } finally {
        hideLoader();
    }
}

function loadCachedData() {
    const cached = localStorage.getItem('pea_data_cache');
    if (cached) {
        try {
            const data = JSON.parse(cached);
            document.getElementById('status').innerText = "Mémoire";
            processData(data);
        } catch (e) {
            console.error("Cache invalide", e);
        }
    }
}

/**
 * TRAITEMENT DES DONNÉES
 */

function processData(result) {
    globalTransactions = result.transactions || [];
    globalDividendes = result.dividende || [];
    globalPlan = result.plan || [];

    globalLive = reconstructLive(result.dataLive, globalTransactions, globalDividendes);
    
    tickerToNameMap = {};
    globalLive.forEach(item => {
        const ticker = (item.ticker || item.ticker_backup || "").toUpperCase().trim();
        const name = item.liste_produits || item.ticker;
        if (ticker) tickerToNameMap[ticker] = name;
    });
    
    if (result.dataLive && result.historiqueProduit) {
        verifyHistoricalData(result);
        if (missingHistories.length > 0 || mismatchedHistories.length > 0) {
            setTimeout(syncHistoricalData, 1000);
        }
    }
    
    const { plans: plansAnalyses, monthlyStats } = analyzeInvestmentPlans(globalPlan, globalTransactions);
    const dividendStats = calculatePeriodicDividends(globalDividendes, globalTransactions);
    
    renderDashboard(globalTransactions, globalLive, monthlyStats, dividendStats);
    renderPlansSection(plansAnalyses);
    renderDividendsTab();
}

function reconstructLive(dataLive, transactions, dividendes) {
    if (!dataLive || !Array.isArray(dataLive)) return [];
    
    return dataLive.map(item => {
        const ticker = item.id_perso || item.tickers_utiliser;
        const productTransactions = getProductTransactions(item, transactions);
        
        const unite = productTransactions.reduce((sum, t) => sum + cleanNumber(t.quantite), 0);
        
        let achatMoyen = 0;
        if (productTransactions.length > 0 && unite > 0) {
            const sumtotalinvesti = productTransactions.reduce((sum, t) => {
                const total = cleanNumber(t.total);
                return sum + (total > 0 ? total : 0);
            }, 0);
            achatMoyen = sumtotalinvesti / unite;
        }
        
        const valeurUnitaire = cleanNumber(item.cour);
        const somme = unite * valeurUnitaire;
        const dividende = getProductDividend(item, dividendes, transactions);
        
        let perfo = 0;
        if (achatMoyen > 0) {
            perfo = (valeurUnitaire - achatMoyen + (unite > 0 ? dividende / unite : 0)) / achatMoyen;
        }
        
        const gainPerte = (valeurUnitaire - achatMoyen) * unite + dividende;
        
        return {
            ticker: ticker,
            ticker_backup: item.tickers_utiliser,
            liste_produits: item.nom,
            valeur_unitaire: valeurUnitaire,
            achat_moyen: achatMoyen,
            unité: unite,
            somme: somme,
            dividende: dividende,
            perfo: perfo,
            'gain/perte': gainPerte
        };
    });
}

function calculateTransactionPerformance(transaction, coursActuel) {
    const prix = cleanNumber(transaction.prix_unitaire || transaction.prix);
    const frais = cleanNumber(transaction.frais);
    const quantite = cleanNumber(transaction.quantite);
    
    const coutRevient = prix + (quantite > 0 ? frais / quantite : 0);
    
    let perf = 0;
    if (coutRevient > 0 && coursActuel > 0) {
        perf = ((coursActuel - coutRevient) / coutRevient) * 100;
    }
    
    return {
        prix, frais, quantite, coutRevient, perf,
        isPos: perf >= 0,
        totalInvesti: transaction.total || ((quantite * prix) + frais)
    };
}

function getProductDividend(item, dividendes, transactions) {
    if (!dividendes || !Array.isArray(dividendes)) return 0;
    
    const ticker = (item.id_perso || item.tickers_utiliser || "").toUpperCase().trim();
    const nom = item.nom;
    const productTransactions = getProductTransactions(item, transactions);
    
    const productDividendes = dividendes.filter(div => {
        const divCode = (div.code || "").toUpperCase().trim();
        const divNom = div.nom || "";
        return (divCode && divCode === ticker) || (divNom && divNom === nom);
    });
    
    return productDividendes.reduce((sum, div) => {
        const montantUnitaire = parseDividende(div["div/u"]);
        const dateVersement = div.date;
        if (montantUnitaire > 0 && dateVersement) {
            const quantity = getQuantityAtDate(productTransactions, dateVersement);
            return sum + (montantUnitaire * quantity);
        }
        return sum;
    }, 0);
}

function getQuantityAtDate(productTransactions, dateLimitStr) {
    const limit = new Date(dateLimitStr);
    return productTransactions.reduce((sum, t) => {
        const tDate = new Date(t.date);
        if (tDate <= limit) return sum + cleanNumber(t.quantite);
        return sum;
    }, 0);
}

function projectNextDividend(product, history) {
    if (!history || history.length === 0) return null;
    const pastDividends = history
        .filter(d => new Date(d.date) <= new Date() && cleanNumber(parseDividende(d["div/u"])) > 0)
        .sort((a, b) => new Date(b.date) - new Date(a.date));
    if (pastDividends.length === 0) return null;

    const last = pastDividends[0];
    const lastVal = cleanNumber(parseDividende(last["div/u"]));
    const frequency = last.fréquence || product.frequence || "Annuel";
    
    let frequencyFactor = 1;
    let monthsToAdd = 12;

    if (frequency === "Semestriel") { monthsToAdd = 6; frequencyFactor = 2; }
    else if (frequency === "Trimestriel") { monthsToAdd = 3; frequencyFactor = 4; }
    else if (frequency === "Bimestriel") { monthsToAdd = 2; frequencyFactor = 6; }
    else if (frequency === "Mensuel") { monthsToAdd = 1; frequencyFactor = 12; }

    const lastDate = new Date(last.date);
    const nextDate = new Date(lastDate);
    nextDate.setMonth(nextDate.getMonth() + monthsToAdd);
    const today = new Date();
    while (nextDate < today) {
        nextDate.setMonth(nextDate.getMonth() + monthsToAdd);
    }

    const quantity = cleanNumber(product.unité);
    const projectedAmount = lastVal * quantity;
    const projectedAnnual = lastVal * quantity * frequencyFactor;

    return {
        ticker: product.ticker || product.ticker_backup,
        nom: product.liste_produits,
        date: nextDate.toISOString().split('T')[0],
        valeurUnitaire: lastVal,
        quantity: quantity,
        prochainMontant: projectedAmount,
        annuelEstime: projectedAnnual,
        frequence: frequency
    };
}

function getDividendProjections() {
    const projections = [];
    Object.values(globalLive).forEach(product => {
        if (cleanNumber(product.unité) <= 0) return;
        const productDivs = globalDividendes.filter(d => {
            const pTicker = (product.ticker || product.ticker_backup || "").toUpperCase().trim();
            const pNom = (product.liste_produits || "").toUpperCase().trim();
            const dCode = (d.code || "").toUpperCase().trim();
            const dNom = (d.nom || "").toUpperCase().trim();
            return (dCode && dCode === pTicker) || (dNom && dNom === pNom);
        });
        const projection = projectNextDividend(product, productDivs);
        if (projection) projections.push(projection);
    });
    return projections.sort((a, b) => new Date(a.date) - new Date(b.date));
}

function calculatePeriodicDividends(dividendes, transactions) {
    if (!dividendes || !Array.isArray(dividendes)) return {};
    const dividendsByYear = {};
    dividendes.forEach(div => {
        const montantUnitaire = parseDividende(div["div/u"]);
        const dateVersement = div.date;
        if (montantUnitaire > 0 && dateVersement) {
            const dateDiv = new Date(dateVersement);
            const year = dateDiv.getFullYear();
            const divCode = (div.code || "").toUpperCase().trim();
            const divNom = (div.nom || "").toUpperCase().trim();
            const productTrans = transactions.filter(t => {
                const tTicker = (t.ticker || "").toUpperCase().trim();
                const tNom = (t.nom || "").toUpperCase().trim();
                return (divCode && tTicker === divCode) || (divNom && tNom === divNom);
            });
            const qty = getQuantityAtDate(productTrans, dateVersement);
            if (qty > 0) {
                const totalRecu = qty * montantUnitaire;
                dividendsByYear[year] = (dividendsByYear[year] || 0) + totalRecu;
            }
        }
    });
    return dividendsByYear;
}

function initDividendes() {
    const saved = localStorage.getItem('pea_manual_dividendes');
    if (saved) {
        const manualDivs = JSON.parse(saved);
        manualDivs.forEach(md => {
            if (!globalDividendes.find(gd => gd.id === md.id)) {
                globalDividendes.push(md);
            }
        });
    }
}

function submitManualDiv() {
    const date = document.getElementById('new-div-date').value;
    const ticker = document.getElementById('new-div-ticker').value;
    const val = document.getElementById('new-div-val').value;

    if (!date || !ticker || !val) {
        alert("Veuillez remplir tous les champs");
        return;
    }

    addManualDividend({
        date: date,
        ticker: ticker,
        valeur: val,
        nom: tickerToNameMap[ticker] || ticker,
        quantite: 0
    });
}

function addManualDividend(data) {
    const newDiv = {
        id: "man_" + Date.now(),
        date: data.date,
        nom: data.nom,
        code: data.ticker,
        valeur: parseFloat(data.valeur),
        quantite: data.quantite || 0,
        isManual: true
    };
    globalDividendes.push(newDiv);
    localStorage.setItem('pea_manual_dividendes', JSON.stringify(globalDividendes.filter(d => d.isManual)));
    renderDividendsTab();
}

function distributeInvestmentsByMonth(plans, transactions) {
    const investmentsByMonth = {};
    transactions.forEach(t => {
        const d = new Date(t.date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        investmentsByMonth[key] = (investmentsByMonth[key] || 0) + cleanNumber(t.total);
    });

    const planRealizedTotals = new Array(plans.length).fill(0);
    const monthlyStats = {};

    Object.keys(investmentsByMonth).sort().forEach(monthKey => {
        const amountToDistribute = investmentsByMonth[monthKey];
        if (amountToDistribute <= 0) return;

        const [year, month] = monthKey.split('-').map(Number);
        const monthStart = new Date(year, month - 1, 1);
        const monthEnd = new Date(year, month, 0);
        const label = monthStart.toLocaleDateString('fr-FR', {month: 'short', year: '2-digit'});

        const activePlansIndices = [];
        let totalTargetForMonth = 0;

        plans.forEach((plan, index) => {
            const pStart = new Date(plan.date_début);
            const pEnd = plan.date_de_cloture && plan.date_de_cloture !== "" 
                ? new Date(plan.date_de_cloture) 
                : new Date(); 

            if (pStart <= monthEnd && pEnd >= monthStart) {
                activePlansIndices.push(index);
                totalTargetForMonth += cleanNumber(plan.montant);
            }
        });

        monthlyStats[label] = {
            realized: amountToDistribute,
            target: totalTargetForMonth
        };

        if (activePlansIndices.length > 0) {
            activePlansIndices.forEach(index => {
                const plan = plans[index];
                const target = cleanNumber(plan.montant);
                let share = 0;
                if (totalTargetForMonth > 0) {
                    const ratio = target / totalTargetForMonth;
                    share = amountToDistribute * ratio;
                }
                planRealizedTotals[index] += share;
            });
        }
    });

    return { totals: planRealizedTotals, monthlyStats: monthlyStats };
}

function analyzeInvestmentPlans(plans, transactions) {
    if (!plans || !Array.isArray(plans)) return { plans: [], monthlyStats: {} };
    
    const { totals: realizedTotals, monthlyStats } = distributeInvestmentsByMonth(plans, transactions);

    const analyzedPlans = plans.map((plan, index) => {
        const dateDebut = new Date(plan.date_début);
        const dateFin = plan.date_de_cloture && plan.date_de_cloture !== ""
            ? new Date(plan.date_de_cloture) 
            : new Date();
        
        const monthsDiff = (dateFin.getFullYear() - dateDebut.getFullYear()) * 12 + (dateFin.getMonth() - dateDebut.getMonth());
        const dureeMoisEffective = Math.max(1, monthsDiff);
        
        const montantPrevu = cleanNumber(plan.montant) * dureeMoisEffective;
        const montantRealise = realizedTotals[index];
        const ecart = montantRealise - montantPrevu;
        const dureeJours = Math.max(1, Math.ceil((dateFin - dateDebut) / (1000 * 60 * 60 * 24)));
        const dureeEcoulee = Math.max(0, Math.ceil((new Date() - dateDebut) / (1000 * 60 * 60 * 24)));
        
        // Calcul Ecart Actuel vs théorique à date
        const moisEcoules = ((new Date().getFullYear() - dateDebut.getFullYear()) * 12 + (new Date().getMonth() - dateDebut.getMonth()) + (new Date().getDate() >= dateDebut.getDate() ? 1 : 0));
        const moisTheoriques = Math.min(dureeMoisEffective, Math.max(0, moisEcoules));
        const ecartActuel = montantRealise - (cleanNumber(plan.montant) * moisTheoriques);

        let progressionTemps = plan.statut === "Clôturé" ? 100 : Math.min(100, (dureeEcoulee / dureeJours) * 100);
        let tauxRealisation = montantPrevu > 0 ? (montantRealise / montantPrevu) * 100 : 0;
        
        const transactionsPeriode = transactions.filter(t => {
            const tDate = new Date(t.date);
            return tDate >= dateDebut && tDate <= dateFin;
        }).length;
        
        return {
            ...plan,
            montantPrevu,
            montantRealise,
            ecart,
            ecartActuel,
            tauxRealisation: Math.round(tauxRealisation),
            nbTransactions: transactionsPeriode,
            dureeJours,
            progressionTemps: Math.round(progressionTemps),
            dateDebut,
            dateFin
        };
    });

    return { plans: analyzedPlans, monthlyStats: monthlyStats };
}

function findLiveItem(identifier) {
    if (!identifier) return null;
    const search = identifier.toUpperCase().trim();
    let match = globalLive.find(item => 
        (item.ticker && item.ticker.toUpperCase().trim() === search) ||
        (item.ticker_backup && item.ticker_backup.toUpperCase().trim() === search)
    );
    if (match) return match;
    match = globalLive.find(item => 
        item.liste_produits && item.liste_produits.toUpperCase().trim() === search
    );
    return match || null;
}

function getProductTransactions(item, transactions) {
    if (!transactions || !Array.isArray(transactions)) return [];
    const idPerso = (item.id_perso || item.code || item.ticker || "").toUpperCase().trim();
    const tickerUtil = (item.tickers_utiliser || item.ticker_backup || "").toUpperCase().trim();
    const nom = (item.nom || item.liste_produits || "").toUpperCase().trim();

    return transactions.filter(t => {
        const tTicker = (t.ticker || "").toUpperCase().trim();
        const tNom = (t.nom || "").toUpperCase().trim();
        if (tTicker && (tTicker === idPerso || tTicker === tickerUtil)) return true;
        if (tNom && tNom === nom) return true;
        return false;
    });
}

/**
 * RENDU UI & DASHBOARD
 */

function renderDashboard(transactions, liveData, planMonthlyStats = {}, dividendStats = {}) {
    const now = new Date();
    document.getElementById('last-update').innerText = "MAJ: " + now.toLocaleDateString('fr-FR') + " " + now.toLocaleTimeString('fr-FR',{ hour: '2-digit', minute: '2-digit' });
    
    // 1. Table Historique (Optimisée pour Card View mobile)
    const historyBody = document.getElementById('table-body-history');
    if (historyBody) {
        historyBody.innerHTML = "";
        displayedTransactions = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));
        
        displayedTransactions.forEach((t, index)=> {
            const identifier = t.ticker || t.nom;
            const liveItem = findLiveItem(identifier);
            
            const d = t.date ? new Date(t.date).toLocaleDateString('fr-FR') : "-";
            const displayName = t.nom || (liveItem ? liveItem.liste_produits : "Autre");
            const tickerKey = t.ticker || (liveItem ? liveItem.ticker : "");
            
            const coursActuel = liveItem ? cleanNumber(liveItem.valeur_unitaire) : 0;
            const { prix, frais, quantite, perf, isPos, totalInvesti } = calculateTransactionPerformance(t, coursActuel);
            
            historyBody.innerHTML += `
                <tr class="transaction-row" onclick="openTransactionDetail(${index})">
                    <td data-label="Actif">
                        <div class="font-bold">${displayName}</div>
                        <div class="text-muted text-sm">${tickerKey} • ${d}</div>
                    </td>
                    <td data-label="Qté" class="hide-mobile text-center">${quantite}</td>
                    <td data-label="P.U." class="hide-mobile text-center">${formatEuro(prix)}</td>
                    <td data-label="Frais" class="hide-mobile text-center text-muted text-sm">${frais > 0 ? formatEuro(frais) : '-'}</td>
                    <td data-label="Total" class="text-right">
                        <div class="font-bold">${formatEuro(totalInvesti)}</div>
                        <div class="${isPos?'text-success':'text-danger'} text-sm font-bold">
                            ${isPos ? '▲' : '▼'} ${perf.toFixed(2)}%
                        </div>
                    </td>
                </tr>
            `;
        });
    }

    // 2. Positions Actuelles (Grid)
    const gridContainer = document.getElementById('positions-grid');
    if (gridContainer) {
        gridContainer.innerHTML = "";
        
        let totalActuel = 0;
        let totalInvesti = 0;
        let totaldiv = 0;
        let statsProduit = {};

        transactions.forEach(t => totalInvesti += cleanNumber(t.total));

        const tickersPossedes = new Set();
        transactions.forEach(t => { if (t.code) tickersPossedes.add(t.code.toUpperCase()); });
        
        const sortedLiveData = liveData.filter(item => {
            return !item.ticker || tickersPossedes.has(item.ticker.toUpperCase());
        }).sort((a, b) => cleanNumber(b.somme) - cleanNumber(a.somme));
        
        sortedLiveData.forEach(item => {
            const nom = item.liste_produits || "Autre";
            const sommeVal = cleanNumber(item.somme);
            const dividende = cleanNumber(item.dividende);
            totaldiv += dividende;
            totalActuel += sommeVal;
            statsProduit[nom] = (statsProduit[nom] || 0) + sommeVal;

            const am = cleanNumber(item.achat_moyen);
            const cours = cleanNumber(item.valeur_unitaire);
            const coutTotal = am * item.unité;
            const valeurTotale = (cours * item.unité) + dividende;
            const perf = coutTotal > 0 ? ((valeurTotale - coutTotal) / coutTotal) * 100 : 0;
            const isPos = perf >= 0;
            const diffCours = cours - am;
            const isDiffPos = diffCours >= 0;
            const identifierForHistory = item.ticker || item.liste_produits;

            gridContainer.innerHTML += `
                <div class="position-card${isPos ? ' positive' : ' negative'}" onclick="showProductHistory('${identifierForHistory}')">
                    <div class="pos-header">
                        <div class="pos-title-group">
                            <div class="pos-name">${nom}</div>
                            <div class="pos-ticker">${item.ticker || '---'}</div>
                        </div>
                        <div class="pos-badge ${isPos ? 'badge-up' : 'badge-down'}">
                            <div class="pos-perf-badge">${isPos ? '▲' : '▼'} ${Math.abs(perf).toFixed(2)}%</div>
                            <div class="pos-perf-cours">${isPos ? '+' : '-'}${formatEuro(Math.abs(valeurTotale-coutTotal))}</div>
                        </div>
                    </div>
                    
                    <div class="pos-details">
                        <div class="pos-row">
                            <span class="pos-label">Valeur</span>
                            <span class="pos-val" style="font-size:1.1rem;">${formatEuro(sommeVal)}</span>
                        </div>
                        <div class="pos-row">
                            <span class="pos-label">Dividendes</span>
                            <span class="pos-val text-muted">${dividende === 0 ? '--' : formatEuro(dividende)}</span>
                        </div>
                        <div style="border-top:1px dashed var(--border); margin:6px 0;"></div>
                        <div class="pos-row">
                            <span class="pos-label">TOTAL</span>
                            <span class="pos-val" style="color:var(--text);">${formatEuro(sommeVal + dividende)}</span>
                        </div>
                    </div>

                    <div class="pos-footer">
                        <div class="pos-stat">
                            <div class="pos-stat-label">Unités</div>
                            <div class="pos-stat-val">${item.unité}</div>
                        </div>
                        <div class="pos-stat">
                            <div class="pos-stat-label">PRU</div>
                            <div class="pos-stat-val">${formatEuro(item.achat_moyen)}</div>
                        </div>
                        <div class="pos-stat">
                            <div class="pos-stat-label">Cours</div>
                            <div class="pos-stat-val" style="color:${isDiffPos ? 'var(--up)' : 'var(--down)'};">
                                ${formatEuro(cours)}
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
        
        document.getElementById('total-gain').innerHTML = `<span class="${gain>=0?'text-success':'text-danger'}">${gain >= 0 ? "+" : ""}${formatEuro(gain)}</span>`;
        document.getElementById('live-perf-global').innerHTML = `<span class="${gain>=0?'text-success':'text-danger'}">${gain >= 0 ? "+" : ""}${perfG.toFixed(2)}%</span>`;

        updateCharts(planMonthlyStats, statsProduit, dividendStats);
        updateCumulativeChart(transactions);
    }
}

function renderDividendsTab() {
    const dividendsTab = document.getElementById('dividend-table-body');
    const allTimeDividends = document.getElementById('total-dividendes-val');
    const yearlyDividendsPRU = document.getElementById('yield-pru-val');
    var totalDividends = 0;
    var PRU = 0
    var totalInvested = 0;

    if (dividendsTab){
        dividendsTab.innerHTML = "";
        globalDividendes.forEach(d => {
            const date = formatDate(d.date);
            const transactionsForProduct = getProductTransactions(d, globalTransactions);
            const quantity = getQuantityAtDate(transactionsForProduct, d.date);
            const dividendeUnitaire = parseDividende(d["div/u"]);
            const total = quantity * dividendeUnitaire;
            
            totalDividends += total;

            dividendsTab.innerHTML += `
                    <tr class="transaction-row">
                        <td data-label="Produit">
                            <div class="font-bold">${d.nom}</div>
                            <div class="text-muted text-sm">${d.code} • ${date}</div>
                        </td>
                        <td data-label="Qté" class="text-center">${quantity}</td>
                        <td data-label="Div/U" class="text-center">${dividendeUnitaire}</td>
                        <td data-label="Total" class="text-right font-bold text-success">${formatEuro(total)}</td>
                    </tr>
                `;
        });
    };
    
    const container = document.getElementById('dividends');
    if (!container) return;

    const projections = getDividendProjections();
    const totalAnnualProjected = projections.reduce((sum, p) => sum + p.annuelEstime, 0);
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const totalNext30Days = projections
        .filter(p => new Date(p.date) <= nextMonth)
        .reduce((sum, p) => sum + p.prochainMontant, 0);

    let html = `
        <div class="div-dashboard-container">
            <!-- SECTION KPI -->
            <div class="grid" style="margin-bottom: 24px;">
                <div class="card card-highlight ${totalAnnualProjected > 0 ? 'success' : ''}">
                    <h3>Dividendes Annuels Estimés</h3>
                    <div class="value text-success">${formatEuro(totalAnnualProjected)}</div>
                    <div class="text-muted text-sm">Projection basée sur portefeuille actuel</div>
                </div>
                <div class="card card-highlight ${totalNext30Days > 0 ? 'success' : ''}">
                    <h3>Prochains 30 Jours</h3>
                    <div class="value">${formatEuro(totalNext30Days)}</div>
                    <div class="text-muted text-sm">Flux de trésorerie entrant</div>
                </div>
            </div>

            <!-- SECTION AJOUT MANUEL -->
            <!--<div class="card card-highlight" style="margin-bottom: 24px;">
                <h3 style="display:flex; align-items:center; gap:8px;">
                    <i data-lucide="plus-circle" style="width:16px;"></i> Saisie Manuelle
                </h3>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
                    <div class="input-group" style="grid-column: span 2;">
                       <input type="date" id="new-div-date">
                    </div>
                    <input type="text" id="new-div-ticker" placeholder="Ticker (ex: AI)">
                    <input type="number" id="new-div-val" placeholder="Montant/u (ex: 2.5)" step="0.01">
                    <button onclick="submitManualDiv()" class="btn btn-primary" style="grid-column: span 2;">Enregistrer</button>
                </div>
            </div>-->

            <!-- SECTION LISTE PROCHAINS VERSEMENTS -->
            <div class="card card-highlight" style="padding:0; overflow:hidden;margin-bottom: 24px;">
                <div style="padding: 20px; border-bottom: 1px solid var(--border);">
                    <h3 style="margin:0;">Calendrier Prévisionnel</h3>
                </div>
                <div style="overflow-x: auto;">
                    <table class="mobile-card-table">
                        <thead style="background: var(--bg);">
                            <tr>
                                <th>Action</th>
                                <th class="text-center">Qté</th>
                                <th class="text-right">Div/u</th>
                                <th class="text-right">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${projections.length > 0 ? projections.map(p => `
                                <tr>
                                    <td data-label="Action">
                                        <div class="font-bold">${p.nom}</div>
                                        <div class="text-muted text-sm">${p.ticker} • ${formatDate(p.date)}</div>
                                    </td>
                                    <td data-label="Qté" class="text-center">${p.quantity}</td>
                                    <td data-label="Div/u" class="text-right">${formatEuro(p.valeurUnitaire)}</td>
                                    <td data-label="Total" class="text-right font-bold text-success">
                                        ${formatEuro(p.prochainMontant)}
                                    </td>
                                </tr>
                            `).join('') : `
                                <tr>
                                    <td colspan="5" class="text-center text-muted" style="padding:20px;">
                                        Aucune projection disponible.
                                    </td>
                                </tr>
                            `}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    globalLive.forEach(product => {
        if(product.dividende !== 0 && cleanNumber(product.unité) > 0) {
            const transactionsForProduct = getProductTransactions(product, globalTransactions);
            const investedForProduct = transactionsForProduct.reduce((sum, t) => sum + cleanNumber(t.total), 0);
            totalInvested += investedForProduct;
        }
    });
    PRU = totalAnnualProjected/totalInvested*100;
    if(yearlyDividendsPRU) yearlyDividendsPRU.innerText = PRU ? PRU.toFixed(2) + " %" : "-- %";

    container.innerHTML = html;
    if(allTimeDividends) allTimeDividends.innerText = formatEuro(totalDividends);
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function renderPlansSection(plansAnalyses) {
    const container = document.getElementById('plans-container');
    if (!container) return;
    
    const sortedPlans = [...plansAnalyses].sort((a, b) => {
        if (a.statut === "En Cours" && b.statut !== "En Cours") return -1;
        if (a.statut !== "En Cours" && b.statut === "En Cours") return 1;
        return new Date(b.date_debut) - new Date(a.date_debut);
    });
    
    container.innerHTML = sortedPlans.map(plan => {
        const isEnCours = plan.statut === "En Cours";
        const cardClass = isEnCours ? 'active' : 'closed';
        
        let progressColor = 'var(--down)';
        if (plan.tauxRealisation >= 100) progressColor = 'linear-gradient(90deg, var(--primary), var(--up))';
        else if (plan.tauxRealisation >= 75) progressColor = 'var(--primary)';
        else if (plan.tauxRealisation >= 50) progressColor = '#f59e0b';
        
        return `
            <div class="plan-card ${cardClass}">
                <div class="plan-header">
                    <div>
                        <div class="font-bold" style="font-size:1.1rem;">${plan.commentaire || 'Plan sans titre'}</div>
                        <div class="plan-dates">
                             <i data-lucide="calendar" style="width:12px;"></i>
                             ${plan.dateDebut.toLocaleDateString('fr-FR')} → ${plan.dateFin.toLocaleDateString('fr-FR')}
                        </div>
                    </div>
                    <span class="status-badge ${isEnCours ? '' : 'closed'}">${plan.statut}</span>
                </div>
                
                <div class="plan-progress">
                    <div class="progress-track">
                        <div class="progress-fill" style="width: ${Math.min(100, plan.tauxRealisation)}%; background: ${progressColor};">
                        </div>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 0.8rem; color: var(--text-muted);">
                        <span>${plan.tauxRealisation}% réalisé</span>
                        <span class="font-bold" style="color:var(--text);">${formatEuro(plan.montantRealise)} / ${formatEuro(plan.montantPrevu)}</span>
                    </div>
                </div>
                
                <div class="plan-stats-grid">
                    <div>
                        <div class="text-muted text-sm font-bold uppercase" style="font-size:0.7rem;">Écart</div>
                        <div class="font-bold ${plan.ecartActuel >= 0 ? 'text-success' : 'text-danger'}">
                            ${plan.ecartActuel >= 0 ? '+' : ''}${formatEuro(plan.ecartActuel)}
                        </div>
                    </div>
                    <div class="text-right">
                        <div class="text-muted text-sm font-bold uppercase" style="font-size:0.7rem;">Transactions</div>
                        <div class="font-bold">${plan.nbTransactions}</div>
                    </div>
                </div>
                
                ${isEnCours ? `
                    <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--border); font-size: 0.75rem; color: var(--text-muted);">
                        ⏱️ Temps écoulé : ${plan.progressionTemps}%
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

/**
 * MODALES & INTERACTIONS
 */

function updateTickerDropdown() {
    const select = document.getElementById('t_ticker');
    select.innerHTML = '<option value="" disabled selected>Choisir un actif...</option>';
    if (typeof tickerToNameMap !== 'undefined') {
        const isMap = tickerToNameMap instanceof Map;
        const tickers = isMap ? Array.from(tickerToNameMap.keys()) : Object.keys(tickerToNameMap);
        tickers.sort().forEach(ticker => {
            const name = isMap ? tickerToNameMap.get(ticker) : tickerToNameMap[ticker];
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name ? `${name} - ${ticker}` : ticker;
            select.appendChild(option);
        });
    }
}

window.showProductHistory = function(identifier) {
    const modal = document.getElementById('productHistoryModal');
    const tbody = document.getElementById('modal-history-body');
    const title = document.getElementById('modal-history-title');
    const coursEl = document.getElementById('modal-history-cours');
    
    if (!modal || !tbody) return;

    const liveItem = findLiveItem(identifier);
    const coursActuel = liveItem ? cleanNumber(liveItem.valeur_unitaire) : 0;
    const productName = liveItem ? liveItem.liste_produits : (identifier || "Produit Inconnu");

    const search = (identifier || "").toUpperCase().trim();
    const productTransactions = globalTransactions.filter(t => {
        const tTicker = (t.ticker || "").toUpperCase().trim();
        const tNom = (t.nom || "").toUpperCase().trim();
        if (liveItem) {
            const liveTicker = (liveItem.ticker || "").toUpperCase().trim();
            const liveName = (liveItem.liste_produits || "").toUpperCase().trim();
            if (tTicker && tTicker === liveTicker) return true;
            if (tNom && tNom === liveName) return true;
            return false;
        } 
        return tTicker === search || tNom === search;
    });
    
    productTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    if(title) title.textContent = productName;
    if(coursEl) coursEl.innerText = "Cours actuel : " + formatEuro(coursActuel);

    tbody.innerHTML = "";
    if (productTransactions.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted" style="padding:24px;">Aucune transaction trouvée.</td></tr>`;
    } else {
        productTransactions.forEach(t => {
            const { prix, frais, quantite, perf, isPos, totalInvesti } = calculateTransactionPerformance(t, coursActuel);
            const d = t.date ? new Date(t.date).toLocaleDateString('fr-FR') : "-";
            
            tbody.innerHTML += `
            <tr class="transaction-row">
                <td data-label="Date" class="text-center">${d}</td>
                <td data-label="Qté" class="text-center">${quantite}</td>
                <td data-label="P.U." class="hide-mobile text-center">${formatEuro(prix)}</td>
                <td data-label="Frais" class="hide-mobile text-center text-muted text-sm">${frais > 0 ? formatEuro(frais) : '-'}</td>
                <td data-label="Total" class="text-center">
                    <div class="font-bold">${formatEuro(totalInvesti)}</div>
                    <div class="${isPos?'text-success':'text-danger'} text-sm font-bold">
                        ${isPos ? '▲' : '▼'} ${Math.abs(perf).toFixed(2)}%
                    </div>
                </td>
            </tr>
            `;
        });
    }
    modal.style.display = 'flex';
};

window.openTransactionDetail = function(index) {
    const t = displayedTransactions[index];
    if (!t) return;
    const modal = document.getElementById('transactionDetailModal');
    if(!modal) return;

    const identifier = t.ticker || t.nom;
    const liveItem = findLiveItem(identifier);
    const coursActuel = liveItem ? cleanNumber(liveItem.valeur_unitaire) : 0;
    const name = liveItem ? liveItem.liste_produits : (t.nom || "Inconnu");
    const tickerDisplay = liveItem ? (liveItem.ticker || t.ticker) : t.ticker;
    const { prix, frais, quantite, perf, isPos, totalInvesti } = calculateTransactionPerformance(t, coursActuel);
    const totalHT = quantite * prix;

    document.getElementById('td-date').innerText = new Date(t.date).toLocaleDateString('fr-FR');
    document.getElementById('td-name').innerText = name;
    document.getElementById('td-ticker').innerText = tickerDisplay || "---";
    document.getElementById('td-cours').innerText = formatEuro(coursActuel);
    
    const perfEl = document.getElementById('td-perf');
    perfEl.innerHTML = `${isPos ? '▲' : '▼'} ${Math.abs(perf).toFixed(2)}%`;
    perfEl.className = `pos-badge ${isPos ? 'badge-up' : 'badge-down'}`;

    document.getElementById('td-qte').innerText = quantite;
    document.getElementById('td-pu').innerText = formatEuro(prix);
    document.getElementById('td-frais').innerText = formatEuro(frais);
    document.getElementById('td-total-ht').innerText = formatEuro(totalHT);
    document.getElementById('td-total-net').innerText = formatEuro(totalInvesti);

    const btnDel = document.getElementById('btn-delete-transaction');
    btnDel.onclick = () => deleteTransaction(t);

    modal.style.display = 'flex';
};

/**
 * LOGIQUE FORMULAIRES & CHART
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

async function handleFormSubmit(e) {
    e.preventDefault();
    const btn = e.target.querySelector('.btn-submit');
    const originalText = btn.innerText;
    btn.innerText = "Traitement...";
    btn.disabled = true;
    showLoader("Enregistrement...");

    const qte = parseFloat(document.getElementById('t_qte').value);
    const prix = parseFloat(document.getElementById('t_prix').value);
    const frais = parseFloat(document.getElementById('t_frais').value) || 0;
    const nom = document.getElementById('t_ticker').value;
    const code = globalLive.find(item => {
        const itemName = (item.liste_produits || "");
        return itemName === nom;
    })?.ticker || "";

    const data = {
        date: document.getElementById('t_date').value,
        ticker: code,
        quantite: qte,
        prix: prix,
        frais: frais,
        total: (qte * prix) + frais,
        nom: nom,
        type: "ACHAT"
    };

    try {
        await fetch(API_URL, { 
            method: 'POST', mode: 'no-cors', 
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
        hideLoader();
    }
}

async function deleteTransaction(transaction) {
    if (!confirm("Supprimer cette transaction ?")) return;
    const btn = document.getElementById('btn-delete-transaction');
    const originalText = btn.innerText;
    btn.innerText = "Suppression...";
    btn.disabled = true;
    showLoader("Suppression...");

    const dataToDelete = { ...transaction, type: "DELETE" };
    try {
        await fetch(API_URL, { 
            method: 'POST', mode: 'no-cors', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dataToDelete) 
        });
        document.getElementById('transactionDetailModal').style.display = 'none';
        document.getElementById('status').innerText = "Supprimé !";
        setTimeout(fetchData, 2000); 
    } catch (error) {
        alert("Erreur lors de la suppression.");
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
        hideLoader();
    }
}

async function syncHistoricalData() {
    if (missingHistories.length === 0 && mismatchedHistories.length === 0) return;
    if (!confirm(`Synchroniser ${missingHistories.length + mismatchedHistories.length} lignes d'historique ?`)) return;

    showLoader("Sync Historique...");
    const allDataToSync = [...missingHistories, ...mismatchedHistories];
    const dataToSync = { type: "SYNC_HISTORY", data: allDataToSync };

    try {
        await fetch(API_URL, { 
            method: 'POST', mode: 'no-cors', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dataToSync) 
        });
        document.getElementById('status').innerText = "Synchronisé !";
        missingHistories = [];
        mismatchedHistories = [];
        setTimeout(fetchData, 2000); 
    } catch (error) {
        alert("Erreur sync.");
    } finally {
        hideLoader();
    }
}

function verifyHistoricalData(result) {
    missingHistories = [];
    mismatchedHistories = [];
    if (result.dataLive && result.historiqueProduit) {
        result.dataLive.forEach((liveItem) => {
            const idPerso = liveItem.id_perso;
            if (result.historiqueProduit[idPerso]) {
                const historique = result.historiqueProduit[idPerso];
                const nonEnregistre = historique['Historique Non Enregistré'] || [];
                const enregistre = historique['Historique Enregistré'] || [];
                const enregistreByDate = {};
                enregistre.forEach(regLine => { enregistreByDate[regLine.date] = regLine; });
                nonEnregistre.forEach((nonRegLine) => {
                    const date = nonRegLine.date;
                    if (!enregistreByDate[date]) {
                        missingHistories.push({ ID_perso: idPerso, data: nonRegLine });
                    } else {
                        const regLine = enregistreByDate[date];
                        const fieldsToCompare = ['date', 'open', 'high', 'low', 'close', 'volume'];
                        const differences = fieldsToCompare.filter(field => regLine[field] !== nonRegLine[field]);
                        if (differences.length > 0) mismatchedHistories.push({ ID_perso: idPerso, data: nonRegLine });
                    }
                });
            } else {
                const nonEnregistre = result.historiqueProduit[idPerso]?.['Historique Non Enregistré'] || [];
                nonEnregistre.forEach(line => missingHistories.push({ ID_perso: idPerso, data: line }));
            }
        });
    }
}

/**
 * EVENTS
 */
function setupEventListeners() {
    const openBtn = document.getElementById('openModalBtn');
    const closeBtn = document.getElementById('closeModalBtn');
    const form = document.getElementById('transactionForm');
    const closeHistoryBtn = document.getElementById('closeHistoryBtn');
    const closeDetailBtn = document.getElementById('closeDetailBtn');

    if(openBtn) {
        openBtn.addEventListener('click', () => {
            updateTickerDropdown();
            document.getElementById('transactionModal').style.display = 'flex';
            document.getElementById('t_date').valueAsDate = new Date();
            resetTicketDisplay(); 
        });
    }
    
    if(closeBtn) closeBtn.addEventListener('click', () => document.getElementById('transactionModal').style.display = 'none');
    if (closeHistoryBtn) closeHistoryBtn.addEventListener('click', () => document.getElementById('productHistoryModal').style.display = 'none');
    if(closeDetailBtn) closeDetailBtn.addEventListener('click', () => document.getElementById('transactionDetailModal').style.display = 'none');

    window.onclick = function(event) {
        if (event.target.classList.contains('modal')) event.target.style.display = "none";
    }

    if(form) {
        form.addEventListener('submit', handleFormSubmit);
        const els = getTicketElements();
        [els.qte, els.prix, els.frais].forEach(input => {
            if(input) input.addEventListener('input', updateTicketCalculations);
        });
    }

    const statusBadge = document.getElementById('status');
    if (statusBadge) {
    let lastTap = 0;
    
    // Support pour Mobile (Touch)
    statusBadge.addEventListener('touchstart', (e) => {
        const currentTime = new Date().getTime();
        const tapLength = currentTime - lastTap;
        if (tapLength < 300 && tapLength > 0) {
            // Empêche le zoom par défaut du navigateur
            e.preventDefault();
            showConfigModal();
        }
        lastTap = currentTime;
    });

    // Support pour PC (Souris) - On garde la compatibilité existante
    statusBadge.addEventListener('dblclick', () => {
        showConfigModal();
    });
}
    /*document.getElementById('status').addEventListener('dblclick', () => {
        const newUrl = prompt("URL API ?", API_URL);
        if (newUrl) {
            localStorage.setItem('pea_api_url', newUrl);
            location.reload();
        }
    });*/

    document.querySelectorAll('.period-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            activePeriod = btn.dataset.period;
            document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const customRangeDiv = document.getElementById('custom-date-range');
            if (activePeriod === 'custom') {
                customRangeDiv.style.display = 'flex';
            } else {
                customRangeDiv.style.display = 'none';
                updateCumulativeChart(globalTransactions);
            }
        });
    });
    
    const applyCustomBtn = document.getElementById('apply-custom-range');
    if (applyCustomBtn) {
        applyCustomBtn.addEventListener('click', () => {
            const startInput = document.getElementById('custom-start-date').value;
            const endInput = document.getElementById('custom-end-date').value;
            if (startInput && endInput) {
                customDateRange.start = startInput;
                customDateRange.end = endInput;
                updateCumulativeChart(globalTransactions);
            }
        });
    }
}

function showConfigModal() {
    const url = prompt("URL Google Apps Script :");
    if (url && url.includes("script.google.com")) {
        localStorage.setItem('pea_api_url', url);
        API_URL = url;
        fetchData();
    }
}

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

function updateCharts(monthlyStats, dataProduit, dividendStats = {}) {
    // 1. Bar Chart (Objectifs)
    const bCtx = document.getElementById('barChart');
    if (bCtx && bCtx.getContext) {
        if (barChartInstance) barChartInstance.destroy();
        const moisLabels = Object.keys(monthlyStats);
        if (moisLabels.length > 0) {
            const realizedValues = moisLabels.map(label => monthlyStats[label].realized);
            const targetValues = moisLabels.map(label => monthlyStats[label].target);
            const indexMoisActuel = moisLabels.length - 1;
            const labelMoisActuel = moisLabels[indexMoisActuel];

            const targetMoisActuel = targetValues[indexMoisActuel] || 0;
            const valeurMoisActuel = realizedValues[indexMoisActuel] || 0;
            const ecartMoisActuel = valeurMoisActuel - targetMoisActuel;

            // Calcul du surplus/manque cumulé sur l'année
            let surplusTotal = 0;
            moisLabels.forEach((label, i) => {
                surplusTotal += (monthlyStats[label].realized - monthlyStats[label].target);
            });
            
            // Logique Ecart (Code existant conservé, juste style update)
            const blueData = moisLabels.map((l) => Math.min(monthlyStats[l].realized, monthlyStats[l].target));
            const greenData = moisLabels.map((l) => Math.max(0, monthlyStats[l].realized - monthlyStats[l].target));
            const redData = moisLabels.map((l) => {
                const r = monthlyStats[l].realized; const t = monthlyStats[l].target;
                if (r < t && l !== labelMoisActuel) return t - r; return 0;
            });
            const bluelightData = moisLabels.map((l) => {
                const r = monthlyStats[l].realized; const t = monthlyStats[l].target;
                if (r < t && l === labelMoisActuel) return t - r; return 0;
            });

            barChartInstance = new Chart(bCtx.getContext('2d'), {
                type: 'bar',
                data: { 
                    labels: moisLabels, 
                    datasets: [
                        { type: 'line', label: 'Cible', data: targetValues, borderColor: '#ef4444', borderWidth: 2, borderDash: [5, 5], pointRadius: 0, stepped: 'middle', order: 1 },
                        { type: 'bar', label: 'Objectif', data: blueData, backgroundColor: '#3b82f6', borderRadius: 4, order: 2},
                        { type: 'bar', label: 'Reste', data: bluelightData, backgroundColor: 'rgba(59, 130, 246, 0.2)', borderWidth: 1, borderColor: '#3b82f6', borderDash: [2, 2], borderRadius: 4, order: 2 },
                        { type: 'bar', label: 'Surplus', data: greenData, backgroundColor: '#10b981', borderRadius: 4, order: 2 },
                        { type: 'bar', label: 'Manque', data: redData, backgroundColor: '#ef4444', borderRadius: 4, order: 2 }
                    ]
                },
                options: { 
                    responsive: true, maintainAspectRatio: false,interaction: { mode: 'index', intersect: false },indexAxis: undefined,
                    scales: { 
                        x: {type: 'category',offset: true, stacked: true, grid: { display: false } },
                        y: { stacked: true, beginAtZero: true, border: { display: false },ticks: { callback: function(value) { return value + ' €'; }, font: {size: 10} } }
                    },
                    plugins: {
                        legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 6 } },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    let label = context.dataset.label || '';
                                    if (label) label += ': ';
                                    if (context.parsed.y !== null) {
                                        label += new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(context.parsed.y);
                                    }
                                    return label;
                                },
                            }
                        }
                    },
                },
                plugins: [{
                    id: 'topLabels',
                    afterDatasetsDraw: (chart) => {
                        const { ctx, scales: { x, y } } = chart;
                    
                        chart.data.labels.forEach((label, index) => {
                            // 1. Calculer la différence réelle (Surplus ou Manque)
                            const realized = monthlyStats[label].realized;
                            const target = monthlyStats[label].target;
                            const diff = realized - target;
                        
                            // Ne rien afficher si l'écart est minime (moins de 1€)
                            if (Math.abs(diff) < 1) return;

                            // 2. Trouver la position Y la plus haute de la pile pour ce mois
                            // On parcourt tous les datasets visibles pour trouver le point le plus haut (valeur Y minimale en pixels)
                            let topY = y.getPixelForValue(0);
                            chart.data.datasets.forEach((dataset, i) => {
                                const meta = chart.getDatasetMeta(i);
                                if (!meta.hidden && dataset.data[index]) {
                                    const model = meta.data[index];
                                    // Attention: en canvas, Y=0 est en haut. Donc on cherche le Y le plus petit.
                                    if (model && model.y < topY) {
                                        topY = model.y;
                                    }
                                }
                            });

                            // 3. Dessiner le texte
                            ctx.save();
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'bottom';
                            ctx.font = 'bold 10px sans-serif';
                        
                            // Couleur conditionnelle
                            ctx.fillStyle = diff >= 0 ? '#10b981' : '#ef4444';
                        
                            // Texte : +XX € ou -XX €
                            const sign = diff >= 0 ? '+' : '';
                            const text = `${sign}${Math.round(diff)} €`;
                        
                            // Position : un peu au-dessus de la barre (topY - 5px)
                            ctx.fillText(text, x.getPixelForValue(index), topY - 5);
                            ctx.restore();
                        });
                    }
                }]
            });
            const container = document.getElementById('objective-info-container');
            if (!container) return;
    
            const ecartClass = ecartMoisActuel >= 0 ? 'text-success' : 'text-danger';
            const ecartIcon = ecartMoisActuel >= 0 ? '▲' : '▼';
            const surplusClass = surplusTotal >= 0 ? 'text-success' : 'text-danger';
            const surplusIcon = surplusTotal >= 0 ? '▲' : '▼';
            const surplusLabel = surplusTotal >= 0 ? 'Excédent' : 'Déficit';
    
            // Nouvelle mise en page plus aérée et visuelle
            container.innerHTML = `
                <div class="grid">
                
                    <!-- Carte Mois Actuel -->
                    <div class="position-card ${ecartMoisActuel >= 0 ? 'positive' : 'negative'}">
                        <div class="pos-header">
                            <span class="pos-title-group">Mois de ${labelMoisActuel}</span>
                            <span class="pos-ticker" style = "item-align : right">Cible: ${formatEuro(targetMoisActuel)}</span>
                        </div>
                        <div style="display: flex; align-items: baseline; gap: 10px;">
                            <span style="font-size: 1.5rem; font-weight: 800; color: var(--text);">${formatEuro(valeurMoisActuel)}</span>
                            <div class="${ecartClass}" style="font-weight: 600; font-size: 0.9rem; display: flex; align-items: center; gap: 2px;">
                                ${ecartIcon} ${formatEuro(Math.abs(ecartMoisActuel))}
                            </div>
                        </div>
                        <div style="height: 4px; width: 100%; background: var(--bg); border-radius: 2px; margin-top: 5px; overflow: hidden;">
                            <div style="height: 100%; width: ${Math.min(100, (valeurMoisActuel/targetMoisActuel)*100)}%; background-color: ${ecartMoisActuel >= 0 ? '#10b981' : '#3b82f6'}; border-radius: 2px;"></div>
                        </div>
                    </div>

                    <!-- Carte Bilan Annuel -->
                    <div class="position-card ${ecartMoisActuel >= 0 ? 'positive' : 'negative'}">
                        <span style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Bilan Annuel</span>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span class="${surplusClass}" style="font-size: 1.5rem; font-weight: 800;">
                                ${surplusIcon} ${surplusTotal >= 0 ? '+' : ''}${formatEuro(surplusTotal)}
                            </span>
                            <span style="font-size: 0.8rem; color: var(--text-muted); background: var(--bg); padding: 4px 8px; border-radius: 6px;">
                                ${surplusLabel} cumulé
                            </span>
                        </div>
                    </div>

                </div>
            `;
        }
    }

    // 2. Pie Chart (Positions)
    const pCtx = document.getElementById('pieChart');
    if (pCtx && pCtx.getContext) {
        if (pieChartInstance) pieChartInstance.destroy();

        // --- LOGIQUE DE GROUPEMENT POUR MOBILE ---
    let finalLabels = Object.keys(dataProduit);
    let finalData = Object.values(dataProduit);
    
    // Si mobile et trop de données (ex: plus de 6 positions)
    if (window.innerWidth < 768 && finalLabels.length > 6) {
        // 1. Créer un tableau d'objets pour trier
        let entries = finalLabels.map((label, i) => ({
            label: label,
            value: finalData[i]
        })).sort((a, b) => b.value - a.value); // Tri décroissant

        // 2. Garder les 5 premiers, grouper le reste
        const top5 = entries.slice(0, 5);
        const others = entries.slice(5);
        const othersValue = others.reduce((sum, entry) => sum + entry.value, 0);

        finalLabels = top5.map(e => e.label);
        finalData = top5.map(e => e.value);
        
        if (othersValue > 0) {
            finalLabels.push("Autres (" + others.length + ")");
            finalData.push(othersValue);
        }
    }

        pieChartInstance = new Chart(pCtx.getContext('2d'), {
            type: 'doughnut',
            data: { 
                labels: finalLabels, 
                datasets: [{ 
                    data: finalData,
                    backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'],
                    borderWidth: 0,
                    hoverOffset: 10
                }]
            },
            options: { 
                responsive: true, maintainAspectRatio: false, cutout: '65%',
                plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, padding: 15,font: { size: window.innerWidth < 768 ? 10 : 12 } }, },
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

    // 3. Dividendes Chart
    const dCtx = document.getElementById('dividendChart');
    if (dCtx && dCtx.getContext) {
        if (dividendChartInstance) dividendChartInstance.destroy();
        const currentYear = new Date().getFullYear();
        const yearlyData = {};
        globalDividendes.forEach(div => {
            const date = new Date(div.date);
            const productTrans = getProductTransactions(div, globalTransactions);
            const qty = getQuantityAtDate(productTrans, date);
            const montant = div['div/u'] * qty || 0;
            yearlyData[date.getFullYear()] = (yearlyData[date.getFullYear()] || 0) + montant;
        });

        let projectionAnnuelle = 0;
        const projectiondividendes = getDividendProjections();
        Object.values(projectiondividendes).forEach(item => projectionAnnuelle += (item.annuelEstime || 0));

        const years = Object.keys(yearlyData).sort();
        if (!years.includes(currentYear.toString())) years.push(currentYear.toString());

        const dataReal = years.map(y => yearlyData[y] || 0);
        const dataProj = years.map(y => y == currentYear ? Math.max(0, projectionAnnuelle - (yearlyData[y] || 0)) : 0);

        dividendChartInstance = new Chart(dCtx, {
            type: 'bar',
            data: {
                labels: years,
                datasets: [
                    { label: 'Reçus', data: dataReal, backgroundColor: '#3b82f6', borderRadius: 4, stack: 'Stack 0' },
                    { label: 'Estimés', data: dataProj, backgroundColor: 'rgba(59, 130, 246, 0.2)', borderDash: [2, 2], borderRadius: 4, borderWidth: 1, borderColor: '#3b82f6', stack: 'Stack 0' }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: { 
                    x: { grid: { display: false } },
                    y: { border: { display: false } }
                },
                plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 6 } } }
            }
        });
    }    
}

function updateCumulativeChart(transactions) {
    const cCtx = document.getElementById('cumulativeChart');
    if (!cCtx || !cCtx.getContext) return;
    if (cumulativeChartInstance) cumulativeChartInstance.destroy();
    // 1. Trier les transactions par date (Opération unique)
    const sortedTransactions = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));

    // Calculer la plage de dates en fonction de la période sélectionnée
    const now = new Date();
    let startDate = new Date();
    
    // Logique de dates selon période
    if (activePeriod === '1m') startDate.setMonth(now.getMonth() - 1);
    else if (activePeriod === '6m') startDate.setMonth(now.getMonth() - 6);
    else if (activePeriod === '1y') startDate.setFullYear(now.getFullYear() - 1);
    else if (activePeriod === 'ytd') startDate = new Date(now.getFullYear(), 0, 1);
    else if (activePeriod === 'max') startDate = sortedTransactions.length ? new Date(sortedTransactions[0].date) : now;
    else if (activePeriod === 'custom' && customDateRange.start) startDate = new Date(customDateRange.start);

    // Filtrer les transactions dans la plage de dates
    const filteredTransactions = sortedTransactions.filter(t => {
        const tDate = new Date(t.date);
        if (activePeriod === 'custom' && customDateRange.start && customDateRange.end) {
            return tDate >= startDate && tDate <= new Date(customDateRange.end);
        }
        return tDate >= startDate;
    });
    
    // Accumuler les investissements à partir du début de la période
    const initialTotal = sortedTransactions
        .filter(t => new Date(t.date) < startDate)
        .reduce((sum, t) => sum + cleanNumber(t.total), 0);
    
    // 2. Groupement Linéaire par date et calcul cumulatif
    const uniqueDates = [];
    const uniqueValues = [];
    const uniqueversemments = [];
    let runningTotal = initialTotal;

    if (filteredTransactions.length > 0 && initialTotal > 0) {
        uniqueDates.push(startDate.toLocaleDateString('fr-FR'));
        uniqueValues.push(initialTotal);
        uniqueversemments.push(0);
    }
    
    filteredTransactions.forEach(t => {
        runningTotal += cleanNumber(t.total);
        const tTotal = cleanNumber(t.total);
        const dateStr = new Date(t.date).toLocaleDateString('fr-FR'); // Format DD/MM/YYYY
        
        // Logique : Si on est sur le même jour que la dernière entrée, on met à jour la valeur
        // Sinon on crée une nouvelle entrée
        if (uniqueDates.length > 0 && uniqueDates[uniqueDates.length - 1] === dateStr) {
            uniqueValues[uniqueValues.length - 1] = runningTotal;
            uniqueversemments[uniqueversemments.length - 1] += tTotal;

        } else {
             uniqueDates.push(dateStr);
             uniqueValues.push(runningTotal);
             uniqueversemments.push(tTotal);
        }
    });

    const ctx = cCtx.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(59, 130, 246, 0.2)');
    gradient.addColorStop(1, 'rgba(59, 130, 246, 0.0)');
    
    cumulativeChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: uniqueDates,
            datasets: [
                {
                    label: 'Investi',
                    data: uniqueValues,
                    borderColor: '#3b82f6',
                    backgroundColor: gradient,
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3,
                    pointRadius: 0,
                    pointHoverRadius: 4
                },
                {
                    type: 'bar',
                    label:'Versé',
                    data: uniqueversemments,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.2)',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.3,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false, labels: { padding: 15, font: { size: 11 }, boxWidth: 10 } },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return 'Total: ' + new Intl.NumberFormat('fr-FR', { 
                                style: 'currency', currency: 'EUR' 
                            }).format(context.parsed.y);
                        },
                    }
                }
            },
            scales: {
                y: {
                    title: { display: true, text: 'Montant Investi (€)', font: { size: 12 } },
                    beginAtZero: initialTotal === 0,
                    grid: { display: true, color: 'rgba(0, 0, 0, 0.05)' },
                    ticks: {
                        callback: function(value) {
                            return new Intl.NumberFormat('fr-FR', { 
                                style: 'currency', currency: 'EUR', maximumFractionDigits: 0
                            }).format(value);
                        }
                    }
                },
                y1: {
                    title: { display: true, text: 'Montant Versé (€)', font: { size: 12 } },
                    beginAtZero: initialTotal === 0,
                    position: 'right',
                    grid: { display: true, color: 'rgba(0, 0, 0, 0.05)' },
                    ticks: {
                        callback: function(value) {
                            return new Intl.NumberFormat('fr-FR', { 
                                style: 'currency', currency: 'EUR', maximumFractionDigits: 0
                            }).format(value);
                        }
                    }
                },
                x: { grid: { display: false }, ticks: { maxTicksLimit: 6 } }
            }
        }
    });
}