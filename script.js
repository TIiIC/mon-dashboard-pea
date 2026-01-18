let API_URL = localStorage.getItem('pea_api_url') || "";
let barChartInstance = null;
let pieChartInstance = null;
let cumulativeChartInstance = null;

// Stockage global pour faire la correspondance Ticker -> Nom Produit
let tickerToNameMap = {};
// Stockage global des transactions pour filtrage
let globalTransactions = [];
// Stockage global des dividendes pour filtrage
let globalDividendes = [];
// Stockage global des plans pour filtrage
let globalPlan = [];
// Stockage global des Produit pour filtrage
let globalLive = {};
// Objectif mensuel pour le graphique
let monthlyObjective = localStorage.getItem('pea_monthly_objective') ? 
    parseFloat(localStorage.getItem('pea_monthly_objective')) : 500;
// Stockage temporaire des transactions affichées pour retrouver l'objet au clic
let displayedTransactions = [];
// Période active pour le graphique cumulatif
let activePeriod = '1m';
let customDateRange = { start: null, end: null }; 

document.addEventListener('DOMContentLoaded', () => {
    if (!API_URL) {
        showConfigModal();
    } else {
        // 1. Tenter d'afficher les données en cache immédiatement
        loadCachedData();
        // 2. Lancer la synchronisation en arrière-plan
        fetchData();
    }
    setupEventListeners();
    setupTabs();
});

// --- LOADER HELPERS ---
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

// --- Charge les données locales ---
function loadCachedData() {
    const cached = localStorage.getItem('pea_data_cache');
    if (cached) {
        try {
            console.log("Chargement des données en cache...");
            const data = JSON.parse(cached);
            document.getElementById('status').innerText = "Mémoire";
            processData(data); // Affiche les données
        } catch (e) {
            console.error("Cache invalide", e);
        }
    }
}

// --- HELPER DIVIDENDES ---

// Convertit "2,05 €" en 2.05
function parseDividende(divString) {
    if (!divString) return 0;
    // Enlever € et espaces, remplacer virgule par point
    const cleaned = divString.toString()
        .replace(/[€\s]/g, '') // Regex pour enlever symbole euro et tout espace
        .replace(',', '.')
        .trim();
    return parseFloat(cleaned) || 0;
}

// Calcule la quantité d'actions possédées à une date précise
function getQuantityAtDate(productTransactions, dateLimitStr) {
    const limit = new Date(dateLimitStr);
    return productTransactions.reduce((sum, t) => {
        const tDate = new Date(t.date);
        // Si la transaction a eu lieu AVANT ou LE JOUR MÊME du versement
        if (tDate <= limit) {
             return sum + cleanNumber(t.quantite);
        }
        return sum;
    }, 0);
}

// Récupère les dividendes totaux perçus pour un produit
// Logique : Somme (Montant Unitaire * Quantité possédée à la date du versement)
function getProductDividend(item, dividendes, transactions) {
    if (!dividendes || !Array.isArray(dividendes)) return 0;
    
    const ticker = (item.id_perso || item.tickers_utiliser || "").toUpperCase().trim();
    const nom = item.nom; // Le nom dans dataLive

    // 1. Récupérer toutes les transactions pour ce produit (pour calculer l'historique des quantités)
    const productTransactions = getProductTransactions(item, transactions);
    
    // 2. Filtrer les lignes de dividendes qui concernent ce produit
    const productDividendes = dividendes.filter(div => {
        const divCode = (div.code || "").toUpperCase().trim();
        const divNom = div.nom || "";
        
        // Match par code ticker OU par nom
        // On vérifie que divCode ou divNom ne sont pas vides pour éviter les faux positifs
        return (divCode && divCode === ticker) || (divNom && divNom === nom);
    });
    
    // 3. Calculer le total réel perçu
    const total = productDividendes.reduce((sum, div) => {
        // On ne traite que les dividendes marqués comme "Reçus" ou si le statut est vide (par défaut)
        // A adapter selon ta rigueur dans le fichier Sheets. Ici on prend tout.
        
        const montantUnitaire = parseDividende(div["div/u"]);
        const dateVersement = div.date; // Format ISO attendu "2025-06-03T00:00:00.000Z"

        if (montantUnitaire > 0 && dateVersement) {
            // Combien d'actions avais-je à cette date ?
            const quantity = getQuantityAtDate(productTransactions, dateVersement);
            return sum + (montantUnitaire * quantity);
        }
        return sum;
    }, 0);
    
    return total;
}

// --- HELPERS D'IDENTIFICATION & PERFORMANCE (FALLBACK) ---

// Trouve un produit dans globalLive par ID ou Nom (Fallback robuste)
function findLiveItem(identifier) {
    if (!identifier) return null;
    const search = identifier.toUpperCase().trim();
    
    // 1. Chercher par ID Perso ou Ticker exact
    let match = globalLive.find(item => 
        (item.ticker && item.ticker.toUpperCase().trim() === search) ||
        (item.ticker_backup && item.ticker_backup.toUpperCase().trim() === search)
    );
    if (match) return match;

    // 2. Chercher par Nom (Liste Produits)
    match = globalLive.find(item => 
        item.liste_produits && item.liste_produits.toUpperCase().trim() === search
    );
    return match || null;
}

// Centralisation du calcul de performance d'une transaction
function calculateTransactionPerformance(transaction, coursActuel) {
    const prix = cleanNumber(transaction.prix_unitaire || transaction.prix);
    const frais = cleanNumber(transaction.frais);
    const quantite = cleanNumber(transaction.quantite);
    
    // PRU = Prix d'achat + (Frais / Quantité)
    const coutRevient = prix + (quantite > 0 ? frais / quantite : 0);
    
    // Perf = (Cours - PRU) / PRU
    let perf = 0;
    if (coutRevient > 0 && coursActuel > 0) {
        perf = ((coursActuel - coutRevient) / coutRevient) * 100;
    }
    
    return {
        prix,
        frais,
        quantite,
        coutRevient,
        perf,
        isPos: perf >= 0,
        totalInvesti: transaction.total || ((quantite * prix) + frais)
    };
}
// Récupère les transactions associées à un produit donné avec fallback
function getProductTransactions(item, transactions) {
    if (!transactions || !Array.isArray(transactions)) return [];
    
    // Récupération plus robuste
    const idPerso = (item.id_perso || "").toUpperCase().trim();
    const tickerUtil = (item.tickers_utiliser || "").toUpperCase().trim();
    const nom = (item.nom || "").toUpperCase().trim();

    return transactions.filter(t => {
        const tTicker = (t.ticker || "").toUpperCase().trim();
        const tNom = (t.nom || "").toUpperCase().trim();
        
        // Match Ticker vs ID ou Ticker vs TickerUtil
        if (tTicker && (tTicker === idPerso || tTicker === tickerUtil)) return true;
        // Match Nom vs Nom
        if (tNom && tNom === nom) return true;
        
        return false;
    });
}

// --- Fonction pour reconstruire l'objet 'live' à partir de dataLive, transactions et dividende ---
function reconstructLive(dataLive, transactions, dividendes) {
    if (!dataLive || !Array.isArray(dataLive)) return [];
    
    return dataLive.map(item => {
        const ticker = item.id_perso || item.tickers_utiliser;
        
        // Récupérer les transactions pour ce produit avec fallback
        const productTransactions = getProductTransactions(item, transactions);
        
        // Calculer unité (somme des quantités)
        const unite = productTransactions.reduce((sum, t) => sum + cleanNumber(t.quantite), 0);
        
        // Calculer achat_moyen: Σ(total / quantité) / Σ(quantité)
        let achatMoyen = 0;
        if (productTransactions.length > 0 && unite > 0) {
            const sumtotalinvesti = productTransactions.reduce((sum, t) => {
                const total = cleanNumber(t.total);
                return sum + (total > 0 ? total : 0);
            }, 0);
            achatMoyen = sumtotalinvesti / unite;
        }
        
        // Données de base
        const valeurUnitaire = cleanNumber(item.cour);
        const somme = unite * valeurUnitaire;
        const dividende = getProductDividend(item, dividendes, transactions);
        
        // Calculer perfo: (valeur_unitaire - achat_moyen + (dividende/unité)) / achat_moyen
        let perfo = 0;
        if (achatMoyen > 0) {
            perfo = (valeurUnitaire - achatMoyen + (unite > 0 ? dividende / unite : 0)) / achatMoyen;
        }
        
        // Calculer gain/perte: (valeur_unitaire - achat_moyen) × unité + dividende
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

// --- Traite et Affiche les données (Factorisation) ---
function processData(result) {
    // Stocker les données globales
    globalTransactions = result.transactions || [];
    globalDividendes = result.dividende || [];
    globalPlan = result.plan || [];

    globalLive = reconstructLive(result.dataLive, globalTransactions, globalDividendes);
    
    // Créer la map Ticker -> Nom à partir des données Live calculées
    tickerToNameMap = {};
    globalLive.forEach(item => {
        const ticker = (item.ticker || item.ticker_backup || "").toUpperCase().trim();
        const name = item.liste_produits || item.ticker;
        if (ticker) tickerToNameMap[ticker] = name;
    });
    
    // Vérifier les données historiques (dataLive vs historiqueProduit)
    if (result.dataLive && result.historiqueProduit) {
        verifyHistoricalData(result);
        // Déclencher la synchronisation automatiquement si des données sont manquantes ou différentes
        if (missingHistories.length > 0 || mismatchedHistories.length > 0) {
            setTimeout(syncHistoricalData, 1000);
        }
    }
    
    const { plans: plansAnalyses, monthlyStats } = analyzeInvestmentPlans(globalPlan, globalTransactions);
    
    // Rendu du dashboard avec les données traitées
    renderDashboard(globalTransactions, globalLive, monthlyStats);
    renderPlansSection(plansAnalyses); // Section Plans d'investissement
}

// Variables globales pour stocker les données de vérification
let missingHistories = [];  // Lignes manquantes à ajouter
let mismatchedHistories = []; // Lignes à mettre à jour (avec nouvelles données seulement)

function verifyHistoricalData(result) {
    missingHistories = [];
    mismatchedHistories = [];
    
    // Vérifier chaque produit dans dataLive
    if (result.dataLive && result.historiqueProduit) {
        result.dataLive.forEach((liveItem, index) => {
            const idPerso = liveItem.id_perso;
            
            // Vérifier si ce produit existe dans historiqueProduit
            if (result.historiqueProduit[idPerso]) {
                const historique = result.historiqueProduit[idPerso];
                const nonEnregistre = historique['Historique Non Enregistré'] || [];
                const enregistre = historique['Historique Enregistré'] || [];
                
                // Créer une map des lignes enregistrées par date pour recherche rapide
                const enregistreByDate = {};
                enregistre.forEach(regLine => {
                    enregistreByDate[regLine.date] = regLine;
                });
                
                // Parcourir les lignes non enregistrées
                nonEnregistre.forEach((nonRegLine, i) => {
                    const date = nonRegLine.date;
                    
                    // Vérifier si la date existe dans l'historique enregistré
                    if (!enregistreByDate[date]) {
                        // Ligne manquante - la date n'existe pas
                        missingHistories.push({
                            ID_perso: idPerso,
                            data: nonRegLine
                        });
                    } else {
                        // La date existe, vérifier si les données sont identiques
                        const regLine = enregistreByDate[date];
                        
                        // Comparer tous les champs: date, open, high, low, close, volume
                        const fieldsToCompare = ['date', 'open', 'high', 'low', 'close', 'volume'];
                        const differences = fieldsToCompare.filter(field => {
                            return regLine[field] !== nonRegLine[field];
                        });
                        
                        if (differences.length > 0) {
                            // Données différentes - stocker seulement les nouvelles données
                            mismatchedHistories.push({
                                ID_perso: idPerso,
                                data: nonRegLine
                            });
                        }
                    }
                });
            } else {
                // Produit pas du tout dans l'historique - ajouter comme manquant
                const nonEnregistre = result.historiqueProduit[idPerso]?.['Historique Non Enregistré'] || [];
                nonEnregistre.forEach(line => {
                    missingHistories.push({
                        ID_perso: idPerso,
                        data: line
                    });
                });
            }
        });
    }
    
    return {
        missing: missingHistories,
        mismatched: mismatchedHistories
    };
}

// --- Récupère les données depuis l'API ---
async function fetchData() {
    const statusEl = document.getElementById('status');
    if (!API_URL) return;

    // On n'affiche le loader "full screen" que si on n'a pas de données en cache,
    // sinon c'est une synchro silencieuse en arrière-plan.
    const isSilent = document.getElementById('table-body-history').innerHTML !== "";
    if (!isSilent) showLoader("Synchronisation...");

    try {
        // Si on a déjà chargé le cache, on indique qu'on sync par dessus
        if (statusEl.innerText !== "Mémoire") {
            statusEl.innerText = "MAJ Sync...";
        } else {
            // Petit indicateur visuel optionnel ou laisser "Mémoire" temporairement
            statusEl.innerText = "Sync...";
        }

        const response = await fetchWithRetry(API_URL);
        const result = await response.json();
        
        // --- SAUVEGARDE EN LOCAL ---
        localStorage.setItem('pea_data_cache', JSON.stringify(result));
        
        statusEl.innerText = "À jour";
        
        // Mise à jour de l'affichage avec les données fraîches
        processData(result);
        
        
    } catch (error) {

        // Si erreur, on garde les données en cache affichées si elles existent
        if (globalTransactions.length > 0) {
            statusEl.innerText = "Hors Ligne"; // Indique qu'on est sur le cache
        } else {
            statusEl.innerText = "Erreur Sync";
        }
        
        console.warn("Erreur de récupération des données : ", error.message);
    } finally {
        hideLoader();
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

// Affiche l'historique complet d'un produit dans une modale
window.showProductHistory = function(identifier) {
    const modal = document.getElementById('productHistoryModal');
    const tbody = document.getElementById('modal-history-body');
    const title = document.getElementById('modal-history-title');
    const coursEl = document.getElementById('modal-history-cours');
    
    if (!modal || !tbody) {
        console.error("Modal historique introuvable dans le DOM");
        return;
    }

    // 1. Trouver les infos Live pour obtenir le cours actuel (Fallback)
    const liveItem = findLiveItem(identifier);
    const coursActuel = liveItem ? cleanNumber(liveItem.valeur_unitaire) : 0;
    const productName = liveItem ? liveItem.liste_produits : (identifier || "Produit Inconnu");

    // 2. Filtrer les transactions (Fallback: Ticker OR Nom)
    const search = (identifier || "").toUpperCase().trim();
    const productTransactions = globalTransactions.filter(t => {
        const tTicker = (t.ticker || "").toUpperCase().trim();
        const tNom = (t.nom || "").toUpperCase().trim();
        
        // Si on a un liveItem, on compare avec ses propriétés
        if (liveItem) {
            const liveTicker = (liveItem.ticker || "").toUpperCase().trim();
            const liveName = (liveItem.liste_produits || "").toUpperCase().trim();
            // Match transaction Ticker vs Live Ticker OU transaction Nom vs Live Nom
            if (tTicker && tTicker === liveTicker) return true;
            if (tNom && tNom === liveName) return true;
            return false;
        } 
        
        // Sinon fallback brute force sur l'identifiant passé
        return tTicker === search || tNom === search;
    });
    
    // Trier par date décroissante
    productTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    // Mise à jour UI
    if(title) title.textContent = productName;
    if(coursEl) coursEl.innerText = "Cours actuel : " + formatEuro(coursActuel);

    // Remplir le tableau
    tbody.innerHTML = "";
    if (productTransactions.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:20px;">Aucune transaction trouvée.</td></tr>`;
    } else {
        productTransactions.forEach(t => {
            // Utilisation du Helper de calcul
            const { prix, frais, quantite, perf, isPos, totalInvesti } = calculateTransactionPerformance(t, coursActuel);
            const d = t.date ? new Date(t.date).toLocaleDateString('fr-FR') : "-";
            
            tbody.innerHTML += `
            <tr class="transaction-row">
                <td style="text-align:center;">${d}</td>
                <td style="text-align:center;">${quantite}</td>
                <td style="text-align:center;">${formatEuro(prix)}</td>
                <td style="font-size: 0.8rem; color: var(--text-muted); text-align:center;">${frais > 0 ? formatEuro(frais) : '-'}</td>
                <td style="text-align:center;">
                    <div style="font-weight: 800; color: var(--text);">${formatEuro(totalInvesti)}</div>
                    <div class="${isPos?'trend-up':'trend-down'}" style="font-weight:bold; font-size: 0.8rem;">
                        ${isPos ? '▲' : '▼'} ${Math.abs(perf).toFixed(2)}%
                    </div>
                </td>
            </tr>
            `;
        });
    }

    modal.style.display = 'flex';
};

// Affiche les détails dans une modale
window.openTransactionDetail = function(index) {
    const t = displayedTransactions[index];
    if (!t) return;

    const modal = document.getElementById('transactionDetailModal');
    if(!modal) return;

    // 1. Identifier le produit (Fallback)
    // On essaie avec le ticker, sinon le nom
    const identifier = t.ticker || t.nom;
    const liveItem = findLiveItem(identifier);
    const coursActuel = liveItem ? cleanNumber(liveItem.valeur_unitaire) : 0;
    const name = liveItem ? liveItem.liste_produits : (t.nom || "Inconnu");
    const tickerDisplay = liveItem ? (liveItem.ticker || t.ticker) : t.ticker;

    // 2. Calculs via Helper centralisé
    const { prix, frais, quantite, perf, isPos, totalInvesti } = calculateTransactionPerformance(t, coursActuel);
    const totalHT = quantite * prix;

    // Remplissage Header
    document.getElementById('td-date').innerText = new Date(t.date).toLocaleDateString('fr-FR');
    document.getElementById('td-name').innerText = name;
    document.getElementById('td-ticker').innerText = tickerDisplay || "---";
    document.getElementById('td-cours').innerText = formatEuro(coursActuel);
    
    const perfEl = document.getElementById('td-perf');
    perfEl.innerHTML = `${isPos ? '▲' : '▼'} ${Math.abs(perf).toFixed(2)}%`;
    perfEl.className = `pos-perf-badge ${isPos ? 'perf-up' : 'perf-down'}`;

    // Remplissage Ticket
    document.getElementById('td-qte').innerText = quantite;
    document.getElementById('td-pu').innerText = formatEuro(prix);
    document.getElementById('td-frais').innerText = formatEuro(frais);
    document.getElementById('td-total-ht').innerText = formatEuro(totalHT);
    document.getElementById('td-total-net').innerText = formatEuro(totalInvesti);

    // Setup Bouton Supprimer
    const btnDel = document.getElementById('btn-delete-transaction');
    btnDel.onclick = () => deleteTransaction(t);

    modal.style.display = 'flex';
};

async function deleteTransaction(transaction) {
    if (!confirm("Êtes-vous sûr de vouloir supprimer cette transaction ?\nCette action est irréversible.")) {
        return;
    }

    const btn = document.getElementById('btn-delete-transaction');
    const originalText = btn.innerText;
    btn.innerText = "Suppression...";
    btn.disabled = true;
    showLoader("Suppression en cours...");

    // On crée l'objet à envoyer pour suppression (type DELETE)
    const dataToDelete = {
        ...transaction,
        type: "DELETE" 
    };

    try {
        await fetch(API_URL, { 
            method: 'POST', 
            mode: 'no-cors', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dataToDelete) 
        });
        
        document.getElementById('transactionDetailModal').style.display = 'none';
        document.getElementById('status').innerText = "Supprimé !";
        setTimeout(fetchData, 2000); 
    } catch (error) {
        console.error("Erreur suppression :", error);
        alert("Erreur lors de la suppression.");
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
        hideLoader();
    }
}

// --- Synchronisation des données historiques ---
async function syncHistoricalData() {
    if (missingHistories.length === 0 && mismatchedHistories.length === 0) {
        alert("Aucune donnée à synchroniser.");
        return;
    }

    const confirmMsg = `Synchroniser ${missingHistories.length} lignes à ajouter et ${mismatchedHistories.length} lignes à mettre à jour ?`;
    if (!confirm(confirmMsg)) {
        return;
    }

    showLoader("Synchronisation des historiques en cours...");
    document.getElementById('status').innerText = "Sync...";

    // Combiner les deux listes
    const allDataToSync = [...missingHistories, ...mismatchedHistories];

    // Créer l'objet à envoyer
    const dataToSync = {
        type: "SYNC_HISTORY",
        data: allDataToSync
    };

    try {
        const response = await fetch(API_URL, { 
            method: 'POST', 
            mode: 'no-cors', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dataToSync) 
        });
        
        document.getElementById('status').innerText = "Synchronisé !";
        console.log("✅ Données synchronisées avec succès");
        
        // Réinitialiser les listes
        missingHistories = [];
        mismatchedHistories = [];
        
        setTimeout(fetchData, 2000); 
    } catch (error) {
        console.error("Erreur synchronisation :", error);
        document.getElementById('status').innerText = "Erreur Sync";
        alert("Erreur lors de la synchronisation.");
    } finally {
        hideLoader();
    }
}

// --- Configuration des écouteurs d'événements ---
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

    if(closeDetailBtn) closeDetailBtn.addEventListener('click', () => document.getElementById('transactionDetailModal').style.display = 'none');

    // Fermer les modales si on clique en dehors (Overlay)
    window.onclick = function(event) {
        if (event.target.classList.contains('modal')) {
            event.target.style.display = "none";
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

    // Écouteurs pour les boutons de période du graphique cumulatif
    document.querySelectorAll('.period-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            activePeriod = btn.dataset.period;
            
            // Mise à jour visuelle des boutons
            document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            btn.style.background = 'var(--bg)';
            document.querySelectorAll('.period-btn:not(.active)').forEach(b => b.style.background = 'var(--card)');
            
            // Gérer l'affichage du sélecteur de dates personnalisées
            const customRangeDiv = document.getElementById('custom-date-range');
            if (activePeriod === 'custom') {
                customRangeDiv.style.display = 'flex';
            } else {
                customRangeDiv.style.display = 'none';
                updateCumulativeChart(globalTransactions);
            }
        });
    });
    
    // Bouton pour appliquer la plage personnalisée
    const applyCustomBtn = document.getElementById('apply-custom-range');
    if (applyCustomBtn) {
        applyCustomBtn.addEventListener('click', () => {
            const startInput = document.getElementById('custom-start-date').value;
            const endInput = document.getElementById('custom-end-date').value;
            
            if (startInput && endInput) {
                customDateRange.start = startInput;
                customDateRange.end = endInput;
                updateCumulativeChart(globalTransactions);
            } else {
                alert('Veuillez sélectionner une date de début et de fin.');
            }
        });
    }
}

//--- Gestion de la soumission du formulaire ---
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

    const data = {
        date: document.getElementById('t_date').value,
        ticker: document.getElementById('t_ticker').value.toUpperCase().trim(),
        quantite: qte,
        prix: prix,
        frais: frais,
        total: (qte * prix) + frais,
        nom: nom,
        type: "ACHAT"
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
        hideLoader();
    }
}

// --- Helpers de formatage ---
// Nettoyage et conversion des nombres
function cleanNumber(val) {
    if (val === undefined || val === null) return 0;
    return parseFloat(val.toString().replace(',', '.')) || 0;
}

// Formatage en Euro
function formatEuro(val) {
    return cleanNumber(val).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}

// --- Rendu du Dashboard ---
// Rendu de la table des transactions et des cartes de positions
function renderDashboard(transactions, liveData, planMonthlyStats = {}) {
    const now = new Date();
    document.getElementById('last-update').innerText = "Dernière màj: " + now.toLocaleDateString('fr-FR') + " à " + now.toLocaleTimeString('fr-FR',{ hour: '2-digit', minute: '2-digit' });
    
    const historyBody = document.getElementById('table-body-history');
    if (historyBody) {
        historyBody.innerHTML = "";
        displayedTransactions = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));
        
        displayedTransactions.forEach((t, index)=> {
            // Utilisation du Helper Fallback pour trouver les infos Live
            const identifier = t.ticker || t.nom;
            const liveItem = findLiveItem(identifier);
            
            const d = t.date ? new Date(t.date).toLocaleDateString('fr-FR') : "-";
            const displayName = t.nom || (liveItem ? liveItem.liste_produits : "Autre");
            const tickerKey = t.ticker || (liveItem ? liveItem.ticker : "");
            
            // Calculs via Helper centralisé
            const coursActuel = liveItem ? cleanNumber(liveItem.valeur_unitaire) : 0;
            const { prix, frais, quantite, perf, isPos, totalInvesti } = calculateTransactionPerformance(t, coursActuel);
            
            historyBody.innerHTML += `
                <tr class="transaction-row" onclick="openTransactionDetail(${index})">
                    <td>
                        <div style="font-size: 0.7rem; color: var(--text-muted); font-family: monospace;">${d}</div>
                        <div style="font-weight: 600; color: var(--text);">${displayName}</div>
                        <div style="font-size: 0.7rem; color: var(--text-muted); font-family: monospace;">${tickerKey}</div>
                    </td>
                    <td class="hide-mobile" style="text-align:center;">${quantite}</td>
                    <td class="hide-mobile" style="text-align:center;">${formatEuro(prix)}</td>
                    <td class="hide-mobile" style="font-size: 0.8rem; color: var(--text-muted); text-align:center;">${frais > 0 ? formatEuro(frais) : '-'}</td>
                    <td style="text-align:right;">
                        <div style="font-weight: 800; color: var(--text);">${formatEuro(totalInvesti)}</div>
                        <div class="${isPos?'trend-up':'trend-down'}" style="font-weight:bold; font-size: 0.75rem;">
                            ${isPos ? '▲' : '▼'} ${perf.toFixed(2)}%
                        </div>
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
        let statsProduit = {};

        // Calculs préliminaires (identique à avant)
        transactions.forEach(t => {
            const val = cleanNumber(t.total);
            totalInvesti += val;
        });

        // Filtrage des données Live pour ne garder que celles possédées
        const tickersPossedes = new Set();
        transactions.forEach(t => {
            if (t.code) tickersPossedes.add(t.code.toUpperCase());
        });
        
        // Filtrage des liveData
        const liveDataFiltered = liveData.filter(item => {
            if(item.ticker && !tickersPossedes.has(item.ticker.toUpperCase())) return false;
            return true;
        });
        // Génération des cartes - Triées de la plus importante à la moins importante
        const sortedLiveData = [...liveDataFiltered].sort((a, b) => {
            const sommeA = cleanNumber(a.somme) || 0;
            const sommeB = cleanNumber(b.somme) || 0;
            return sommeB - sommeA; // Ordre décroissant (plus important en premier)
        });
        
        sortedLiveData.forEach(item => {
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
            
            // Fallback : On passe le ticker s'il existe, sinon le nom
            const identifierForHistory = item.ticker || item.liste_produits;

            gridContainer.innerHTML += `
                <div class="position-card" onclick="showProductHistory('${identifierForHistory}')">
                    <!-- HEADER -->
                    <div class="pos-header" style="margin-bottom: 12px;">
                        <div class="pos-title-group">
                            <div class="pos-name">${nom}</div>
                            <div class="pos-ticker">${item.ticker || '---'}</div>
                        </div>
                        <div class="pos-perfo-group ${isPos ? 'perf-up' : 'perf-down'}">
                            <div class="pos-perf-badge">${isPos ? '▲' : '▼'} ${Math.abs(perf).toFixed(2)}%</div>
                            <div class="pos-perf-cours">${isPos ? '+' : '-'}${formatEuro(Math.abs(valeurTotale-coutTotal))}</div>
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

        updateCharts(planMonthlyStats, statsProduit);
        updateCumulativeChart(transactions);
    }
}

// Mise à jour du dropdown des actifs dans la modale
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
function updateCharts(monthlyStats, dataProduit) {
    const bCtx = document.getElementById('barChart');
    if (bCtx && bCtx.getContext) {
        if (barChartInstance) barChartInstance.destroy();
        
        // Calculs pour la cible
        const moisLabels = Object.keys(monthlyStats);
        if (moisLabels.length === 0) return;
        
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
        
        // Créer les datasets empilés avec couleurs conditionnelles
        // Dataset 1 (BLEU): La partie jusqu'à l'objectif
        const blueData = moisLabels.map((l, i) => Math.min(monthlyStats[l].realized, monthlyStats[l].target));
        
        // Dataset 2 (VERT): Le surplus (au-dessus de l'objectif)
        const greenData = moisLabels.map((l, i) => Math.max(0, monthlyStats[l].realized - monthlyStats[l].target));
        
        // Dataset 3 (ROUGE): Le manque pour les mois passés seulement
        const redData = moisLabels.map((l, i) => {
            const r = monthlyStats[l].realized;
            const t = monthlyStats[l].target;
            // Seulement pour les mois passés
            if (r < t && l !== labelMoisActuel) {
                return t - r;
            }
            return 0;
        });
        // Dataset 4 (BLEU CLAIR): Le restant à faire pour le mois en cours
        const bluelightData = moisLabels.map((l, i) => {
            const r = monthlyStats[l].realized;
            const t = monthlyStats[l].target;
            // Seulement pour le mois actuel
            if (r < t && l === labelMoisActuel) {
                return t - r;
            }
            return 0;
        });
        
        barChartInstance = new Chart(bCtx.getContext('2d'), {
            type: 'bar',
            data: { 
                labels: moisLabels, 
                datasets: [
                    {
                        type: 'line',
                        label: 'Ligne Objectif',
                        data: targetValues,
                        borderColor: '#ef4444',
                        borderWidth: 2,
                        borderDash: [6, 5],
                        pointRadius: 0,
                        stepped : 'before',
                        xAxisId: 'x2',
                        stepped: 'middle',
                        fill: false,
                        order: 1,
                    },
                    { 
                        type: 'bar',
                        label: 'Objectif', 
                        data: blueData, 
                        backgroundColor: '#3b82f6',
                        borderRadius: [4, 4, 0, 0], // Arrondi seulement si c'est le haut de pile
                        xAxisId: 'x1',
                        order: 2
                    },
                    {
                        type: 'bar',
                        label: 'Restant',
                        data: bluelightData,
                        backgroundColor: 'rgba(59, 131, 246, 0.3)', // Plus transparent
                        borderRadius: [4, 4, 0, 0],
                        borderWidth: 1,
                        borderColor: '#3b82f6',
                        borderDash: [5, 5], // Pointillé pour montrer que c'est virtuel
                        xAxisId: 'x1',
                        order: 2
                    },
                    {
                        type: 'bar',
                        label: 'Surplus',
                        data: greenData,
                        backgroundColor: '#10b981',
                        borderRadius: [4, 4, 0, 0],
                        xAxisId: 'x1',
                        order: 2
                    },
                    {
                        type: 'bar',
                        label: 'Manquant',
                        data: redData,
                        backgroundColor: '#ef4444',
                        borderRadius: [4, 4, 0, 0],
                        xAxisId: 'x1',
                        order: 2
                    }
                ]
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                indexAxis: undefined,
                animation: {
                    duration: 1200, // Durée totale un peu plus longue
                    easing: 'easeOutQuart', // Effet de freinage fluide à la fin
                    delay: (context) => {
                        // Délai progressif : chaque barre démarre un peu après la précédente
                        let delay = 0;
                        if (context.type === 'data' && context.mode === 'default') {
                            delay = context.dataIndex * 100 + context.datasetIndex * 50;
                        }
                        return delay;
                    }
                },
                plugins: { 
                    legend: { 
                        display: true,
                        position: 'bottom',
                        labels: { padding: 15, font: { size: 10 }, boxWidth: 8, usePointStyle: true }
                    },
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
                scales: { 
                    x1: {
                        type: 'category',
                        stacked: true,
                        display: false, // On cache les labels pour ne pas dupliquer
                        offset: true, // Les barres sont centrées
                        grid: { display: false } // Cleaner
                    },
                    x2: { 
                        type : 'category',
                        display: false, // On cache les labels pour ne pas dupliquer
                        offset: false,   // TRUE = Aligné avec les barres (centré), FALSE = Aligné avec la grille (début du mois)
                        grid: { display: false },
                        stacked: false // Important : ne pas empiler la ligne
                    },
                    y: { 
                        stacked: true,
                        beginAtZero: true, 
                        grid: { color: 'rgba(200, 200, 200, 0.1)' },
                        ticks: { callback: function(value) { return value + ' €'; }, font: {size: 10} } 
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
    
        const ecartClass = ecartMoisActuel >= 0 ? 'trend-up' : 'trend-down';
        const ecartIcon = ecartMoisActuel >= 0 ? '▲' : '▼';
        const surplusClass = surplusTotal >= 0 ? 'trend-up' : 'trend-down';
        const surplusIcon = surplusTotal >= 0 ? '▲' : '▼';
        const surplusLabel = surplusTotal >= 0 ? 'Excédent' : 'Déficit';
    
        // Nouvelle mise en page plus aérée et visuelle
        container.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
                
                <!-- Carte Mois Actuel -->
                <div style="background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 15px; display: flex; flex-direction: column; gap: 5px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Mois de ${labelMoisActuel}</span>
                        <span style="font-size: 0.75rem; background: var(--bg); padding: 2px 8px; border-radius: 4px; color: var(--text-muted);">Cible: ${formatEuro(targetMoisActuel)}</span>
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
                <div style="background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 15px; display: flex; flex-direction: column; justify-content: center; gap: 5px;">
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
                animation: {
                    duration: 1000,
                    // Animation personnalisée pour chaque segment (Staggering)
                    delay: (context) => {
                        let delay = 0;
                        if (context.type === 'data' && context.mode === 'default') {
                            delay = context.dataIndex * 100;
                        }
                        return delay;
                    },
                },
                plugins: { 
                    legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 12, padding: 15, font: { size: 12, weight: '600' } } },
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
                },
                transitions: {
                    active: {
                        animation: {
                            duration: 400,
                        }
                    }
                },
                
            }
        });
    }
}

// Fonction pour générer le graphique d'évolution cumulative
function updateCumulativeChart(transactions) {
    const cCtx = document.getElementById('cumulativeChart');
    if (!cCtx || !cCtx.getContext) return;
    
    if (cumulativeChartInstance) cumulativeChartInstance.destroy();
    
    // 1. Trier les transactions par date (Opération unique)
    const sortedTransactions = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));
    
    // Calculer la plage de dates en fonction de la période sélectionnée
    const now = new Date();
    let startDate = new Date();
    
    if (activePeriod === '1m') {
        startDate.setMonth(now.getMonth() - 1); // 1 mois
    } else if (activePeriod === '6m') {
        startDate.setMonth(now.getMonth() - 6); // 6 mois
    } else if (activePeriod === '1y') {
        startDate.setFullYear(now.getFullYear() - 1); // 1 an
    } else if (activePeriod === 'ytd') {
        startDate = new Date(now.getFullYear(), 0, 1);// Début de l'année en cours
    } else if (activePeriod === '5y') {
        startDate.setFullYear(now.getFullYear() - 5); // 5 ans
    } else if (activePeriod === 'max') {
        startDate = transactions.map(t => new Date(t.date)).reduce((min, current) => current < min ? current : min, now); // Date la plus ancienne
    } else if (activePeriod === 'custom') {
        if (customDateRange.start && customDateRange.end) {
            startDate = new Date(customDateRange.start);
            endDate = new Date(customDateRange.end);
            endDate.setHours(23, 59, 59, 999);
        } else {
            // Si pas de date personnalisée, par défaut 1 mois
            startDate.setMonth(now.getMonth() - 1);
        }
    }
    
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
    let runningTotal = initialTotal;
    
    if (filteredTransactions.length > 0 && initialTotal > 0) {
        uniqueDates.push(startDate.toLocaleDateString('fr-FR'));
        uniqueValues.push(initialTotal);
    }
    
    filteredTransactions.forEach(t => {
        runningTotal += cleanNumber(t.total);
        const dateStr = new Date(t.date).toLocaleDateString('fr-FR'); // Format DD/MM/YYYY
        
        // Logique : Si on est sur le même jour que la dernière entrée, on met à jour la valeur
        // Sinon on crée une nouvelle entrée
        if (uniqueDates.length > 0 && uniqueDates[uniqueDates.length - 1] === dateStr) {
             uniqueValues[uniqueValues.length - 1] = runningTotal;
        } else {
             uniqueDates.push(dateStr);
             uniqueValues.push(runningTotal);
        }
    });

    // Création d'un dégradé pour le remplissage du graphique
    const ctx = cCtx.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(59, 130, 246, 0.4)'); // Bleu plus opaque en haut
    gradient.addColorStop(1, 'rgba(59, 130, 246, 0.0)'); // Transparent en bas
    
    cumulativeChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: uniqueDates,
            datasets: [{
                label: 'Capital Investi Cumulé',
                data: uniqueValues,
                borderColor: '#3b82f6',
                backgroundColor: gradient, // Utilisation du dégradé
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointRadius: 4,
                pointHoverRadius: 6,
                pointBackgroundColor: '#3b82f6',
                pointBorderColor: '#fff',
                pointBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            animation: {
                    // Les barres montent les unes après les autres comme une onde
                    delay: (context) => context.dataIndex * 10,
                    duration: 1000,
                    easing: 'easeOutBack' // Petit dépassement puis retour en place
                },
            plugins: {
                legend: {
                    display: true,
                    labels: { padding: 15, font: { size: 11 }, boxWidth: 10 }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return 'Total: ' + new Intl.NumberFormat('fr-FR', { 
                                style: 'currency', currency: 'EUR' 
                            }).format(context.parsed.y);
                        },
                        afterLabel: function(context) {
                            if (context.dataIndex > 0) {
                                const previous = context.dataset.data[context.dataIndex - 1];
                                const current = context.parsed.y;
                                const diff = current - previous;
                                return 'Versé: ' + new Intl.NumberFormat('fr-FR', { 
                                    style: 'currency', currency: 'EUR' 
                                }).format(diff);
                            }
                            return 'Solde initial: ' + new Intl.NumberFormat('fr-FR', { 
                                style: 'currency', currency: 'EUR' 
                            }).format(initialTotal);
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: initialTotal === 0,
                    min: initialTotal > 0 ? initialTotal * 0.9 : undefined, // Zoom automatique léger
                    grid: { display: true, color: 'rgba(0, 0, 0, 0.05)' },
                    ticks: {
                        callback: function(value) {
                            return new Intl.NumberFormat('fr-FR', { 
                                style: 'currency', currency: 'EUR', maximumFractionDigits: 0
                            }).format(value);
                        }
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: {
                        maxRotation: 0,
                        autoSkip: true,
                        maxTicksLimit: (activePeriod === '1m') ? 6 : 10,
                        callback: function(value, index, values) {
                            const label = this.getLabelForValue(value);
                            // Conversion du label string (DD/MM/YYYY) en Date pour formatage intelligent
                            let date;
                            if (label.includes('/')) {
                                const parts = label.split('/');
                                date = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
                            } else {
                                date = new Date(label);
                            }
                            if (isNaN(date.getTime())) return label;
                            
                            // Formatage intelligent selon l'année
                            const now = new Date();
                            const isCurrentYear = date.getFullYear() === now.getFullYear();

                            if (activePeriod === '5y') {
                                return date.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
                            } else {
                                if (isCurrentYear) {
                                    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
                                } else {
                                    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: '2-digit' });
                                }
                            }
                        }
                    }
                }
            }
        }
    });
}

// Fonction pour mettre à jour l'objectif mensuel
function updateMonthlyObjective(value) {
    monthlyObjective = parseFloat(value) || 500;
    localStorage.setItem('pea_monthly_objective', monthlyObjective);
    fetchData(); // Recharger pour mettre à jour les graphiques
}

// --- ANALYSE DES PLANS D'INVESTISSEMENT (LOGIQUE PRO-RATA) ---

/**
 * Calcule la distribution des investissements réels sur les plans actifs
 * selon une logique de pro-rata mensuel.
 * Retourne aussi les stats mensuelles globales (Cible vs Réel).
 */
function distributeInvestmentsByMonth(plans, transactions) {
    // 1. Regrouper les investissements réels par mois (Clé: "YYYY-MM")
    const investmentsByMonth = {};
    transactions.forEach(t => {
        const d = new Date(t.date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        investmentsByMonth[key] = (investmentsByMonth[key] || 0) + cleanNumber(t.total);
    });

    // Tableau pour stocker le total accumulé pour chaque plan (par index)
    const planRealizedTotals = new Array(plans.length).fill(0);
    // Objet pour stocker les stats mensuelles pour le graphique
    const monthlyStats = {};

    // 2. Parcourir chaque mois où de l'argent a été investi
    Object.keys(investmentsByMonth).sort().forEach(monthKey => {
        const amountToDistribute = investmentsByMonth[monthKey];
        if (amountToDistribute <= 0) return;

        // Reconstruire les dates de début et fin du mois courant pour comparaison
        const [year, month] = monthKey.split('-').map(Number);
        const monthStart = new Date(year, month - 1, 1);
        const monthEnd = new Date(year, month, 0); // Dernier jour du mois

        // Label pour le graphique (ex: "janv. 23")
        const label = monthStart.toLocaleDateString('fr-FR', {month: 'short', year: '2-digit'});

        // 3. Identifier les plans actifs durant ce mois spécifique
        const activePlansIndices = [];
        let totalTargetForMonth = 0;

        plans.forEach((plan, index) => {
            const pStart = new Date(plan.date_début);
            // Si pas de date de clôture, on considère jusqu'à aujourd'hui/futur
            const pEnd = plan.date_de_cloture && plan.date_de_cloture !== "" 
                ? new Date(plan.date_de_cloture) 
                : new Date(); 

            // Vérifier chevauchement de dates : (PlanStart <= MonthEnd) ET (PlanEnd >= MonthStart)
            if (pStart <= monthEnd && pEnd >= monthStart) {
                activePlansIndices.push(index);
                totalTargetForMonth += cleanNumber(plan.montant); // "montant" est la cible mensuelle du plan
            }
        });

        // Stocker les stats globales pour ce mois
        monthlyStats[label] = {
            realized: amountToDistribute,
            target: totalTargetForMonth
        };

        // 4. Distribuer le montant réel proportionnellement aux cibles
        if (activePlansIndices.length > 0) {
            activePlansIndices.forEach(index => {
                const plan = plans[index];
                const target = cleanNumber(plan.montant);
                
                let share = 0;
                if (totalTargetForMonth > 0) {
                    // Formule : (Cible du Plan / Total des Cibles Actives) * Argent Réellement Investi
                    const ratio = target / totalTargetForMonth;
                    share = amountToDistribute * ratio;
                } else {
                    // Si plans actifs mais cibles à 0 (cas limite), répartition égale ?
                    // Ici on laisse à 0 pour éviter division par zéro
                }
                
                planRealizedTotals[index] += share;
            });
        }
        // Note: Si aucun plan n'est actif ce mois-là, l'argent "Investi" n'est attribué à aucun plan.
    });

    return { 
        totals: planRealizedTotals, 
        monthlyStats: monthlyStats 
    };
}

function analyzeInvestmentPlans(plans, transactions) {
    if (!plans || !Array.isArray(plans)) return { plans: [], monthlyStats: {} };
    
    // Étape 1 : Calculer la répartition intelligente (Pro-rata)
    const { totals: realizedTotals, monthlyStats } = distributeInvestmentsByMonth(plans, transactions);

    // Étape 2 : Construire les objets complets
    const analyzedPlans = plans.map((plan, index) => {
        // Dates du plan
        const dateDebut = new Date(plan.date_début);
        const dateFin = plan.date_de_cloture && plan.date_de_cloture !== ""
            ? new Date(plan.date_de_cloture) 
            : new Date(); // Si "En Cours", jusqu'à aujourd'hui
        
        // Calcul du prévisionnel
        // Nombre de mois théoriques touchés par le plan
        const dureeMois = (dateFin.getFullYear() - dateDebut.getFullYear()) * 12 + (dateFin.getMonth() - dateDebut.getMonth()) + (dateFin.getDate() >= dateDebut.getDate() ? 1 : 0);
        // Ajustement fin : on compte souvent le mois entamé comme 1 mois complet ou on fait un diff précis.
        // Ici on garde ta logique précédente ou une version simplifiée :
        const monthsDiff = (dateFin.getFullYear() - dateDebut.getFullYear()) * 12 + (dateFin.getMonth() - dateDebut.getMonth());
        // On s'assure d'avoir au moins 1 mois si les dates sont proches
        const dureeMoisEffective = Math.max(1, monthsDiff);
        
        const montantPrevu = cleanNumber(plan.montant) * dureeMoisEffective;
        
        
        // Récupération du montant réalisé calculé par la fonction de distribution
        const montantRealise = realizedTotals[index];
        
        // Calculer écart et taux
        const ecart = montantRealise - montantPrevu;
        const ecartActuel = montantRealise - (cleanNumber(plan.montant) * (Math.min(dureeMoisEffective, Math.max(0, ((new Date().getFullYear() - dateDebut.getFullYear()) * 12 + (new Date().getMonth() - dateDebut.getMonth()) + (new Date().getDate() >= dateDebut.getDate() ? 1 : 0))))));
        const tauxRealisation = montantPrevu > 0 
            ? (montantRealise / montantPrevu) * 100 
            : 0;
        
        // Durée temporelle (pour la progression "Temps")
        const dureeJours = Math.max(1, Math.ceil((dateFin - dateDebut) / (1000 * 60 * 60 * 24)));
        const dureeEcoulee = Math.max(0, Math.ceil((new Date() - dateDebut) / (1000 * 60 * 60 * 24)));
        
        let progressionTemps = 0;
        if (plan.statut === "Clôturé") {
            progressionTemps = 100;
        } else {
            progressionTemps = Math.min(100, (dureeEcoulee / dureeJours) * 100);
        }
        
        // Compter les transactions (Juste pour info, même si le montant est redistribué)
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
            nbTransactions: transactionsPeriode, // Nombre de transactions dans la période (indicatif)
            dureeJours,
            progressionTemps: Math.round(progressionTemps),
            dateDebut,
            dateFin
        };
    });

    return { 
        plans: analyzedPlans,
        monthlyStats: monthlyStats
    };
}

// --- RENDU DES PLANS ---
function renderPlansSection(plansAnalyses) {
    const container = document.getElementById('plans-container');
    if (!container) return;
    
    // Trier : En Cours en premier, puis par date décroissante
    const sortedPlans = [...plansAnalyses].sort((a, b) => {
        if (a.statut === "En Cours" && b.statut !== "En Cours") return -1;
        if (a.statut !== "En Cours" && b.statut === "En Cours") return 1;
        return new Date(b.date_debut) - new Date(a.date_debut);
    });
    
    if (sortedPlans.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px;">
                Aucun plan d'investissement configuré.
            </div>
        `;
        return;
    }
    
    container.innerHTML = sortedPlans.map(plan => {
        const isEnCours = plan.statut === "En Cours";
        const statusClass = isEnCours ? 'status-en-cours' : 'status-cloture';
        const cardClass = isEnCours ? 'plan-en-cours' : 'plan-cloture';
        
        // Classe de progression selon taux
        let progressClass = 'progress-below-50';
        if (plan.tauxRealisation >= 100) progressClass = 'progress-100plus';
        else if (plan.tauxRealisation >= 75) progressClass = 'progress-75-100';
        else if (plan.tauxRealisation >= 50) progressClass = 'progress-50-75';
        
        // Formatage dates
        const dateDebutStr = plan.dateDebut.toLocaleDateString('fr-FR');
        const dateFinStr = plan.dateFin.toLocaleDateString('fr-FR');
        
        return `
            <div class="plan-card ${cardClass}">
                <!-- Header -->
                <div class="plan-header">
                    <div>
                        <div class="plan-title">${plan.commentaire || 'Plan sans titre'}</div>
                        <div class="plan-dates">${dateDebutStr} → ${dateFinStr}</div>
                    </div>
                    <span class="plan-status-badge ${statusClass}">${plan.statut}</span>
                </div>
                
                <!-- Barre de progression -->
                <div class="plan-progress">
                    <div class="progress-bar-container">
                        <div class="progress-bar-fill ${progressClass}" 
                             style="width: ${Math.min(100, plan.tauxRealisation)}%">
                        </div>
                    </div>
                    <div class="progress-text">
                        <span>${plan.tauxRealisation}% réalisé</span>
                        <span>${formatEuro(plan.montantRealise)} / ${formatEuro(plan.montantPrevu)}</span>
                    </div>
                </div>
                
                <!-- Stats -->
                <div class="plan-stats">
                    <div class="plan-stat">
                        <div class="plan-stat-label">Écart / Previsionnel</div>
                        <div class="plan-stat-value ${plan.ecartActuel >= 0 ? 'positive' : 'negative'}">
                            ${plan.ecartActuel >= 0 ? '+' : ''}${formatEuro(plan.ecartActuel)}
                        </div>
                    </div>
                    <div class="plan-stat">
                        <div class="plan-stat-label">Transactions</div>
                        <div class="plan-stat-value">${plan.nbTransactions}</div>
                    </div>
                </div>
                
                ${isEnCours ? `
                    <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border); font-size: 0.75rem; color: var(--text-muted);">
                        ⏱️ Progression temporelle : ${plan.progressionTemps}% (${plan.dureeJours} jours)
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
}