# 🚀 Dashboard PEA - TodoList v3.0
## Roadmap d'exploitation des données historiques

> **Objectif** : Guide de développement pour nouvelles fonctionnalités exploitant les données historiques OHLCV (Open, High, Low, Close, Volume) disponibles dans `result.historiqueProduit`

---

## 📊 STRUCTURE DES DONNÉES DISPONIBLES

### 1. Données historiques (OHLCV)
**Source** : `result.historiqueProduit[idPerso]`

**Format** :
```javascript
{
  "idPerso": {
    "Historique Enregistré": [
      {
        date: "2025-01-30",
        open: 42.50,
        high: 43.20,
        low: 42.10,
        close: 42.80,
        volume: 125000
      },
      // ... données historiques sauvegardées
    ],
    "Historique Non Enregistré": [
      // ... données live Google Finance (non persistées)
    ]
  }
}
```

**Champs disponibles** :
- `date` : Date de la séance (YYYY-MM-DD)
- `open` : Prix d'ouverture
- `high` : Plus haut de la journée
- `low` : Plus bas de la journée
- `close` : Prix de clôture
- `volume` : Volume échangé

### 2. Données actuelles (Live)
**Source** : `globalLive` (reconstruit depuis dataLive + transactions)

**Format** :
```javascript
[
  {
    ticker: "EPA:CACC",
    ticker_backup: "EPA:CACC",
    liste_produits: "CAC 40 EUR (Acc)",
    valeur_unitaire: 42.80,
    achat_moyen: 37.50,
    unité: 10,
    somme: 428.00,
    dividende: 20.50,
    perfo: 0.141,  // 14.1%
    'gain/perte': 53.00
  },
  // ... autres produits
]
```

### 3. Données transactionnelles
**Source** : `globalTransactions`

**Format** :
```javascript
[
  {
    date: "2025-01-15",
    nom: "CAC 40 EUR (Acc)",
    ticker: "EPA:CACC",
    quantite: 5,
    prix: 37.50,
    frais: 2.50,
    total: 190.00
  },
  // ... autres transactions
]
```

---

## 🎯 FONCTIONNALITÉS À IMPLÉMENTER

### NIVEAU 1 : Graphiques historiques basiques (Priorité HAUTE)

#### ✅ Feature 1.1 : Graphique historique d'un produit
**Description** : Afficher l'évolution du cours d'un produit sur une période donnée

**Données requises** :
- `result.historiqueProduit[idPerso]["Historique Enregistré"]`

**Implémentation** :
1. **Fonction helper** :
```javascript
/**
 * Récupère l'historique OHLCV d'un produit
 * @param {string} identifier - Ticker ou nom du produit
 * @param {string} period - Période : '1m', '3m', '6m', '1y', 'ytd', 'max'
 * @returns {Array<{date, open, high, low, close, volume}>}
 */
function getProductHistory(identifier, period = 'max') {
  // 1. Trouver le produit dans globalLive
  const liveItem = findLiveItem(identifier);
  if (!liveItem) return [];
  
  // 2. Récupérer historique depuis cache
  const cached = JSON.parse(localStorage.getItem('pea_data_cache') || '{}');
  const history = cached.historiqueProduit?.[liveItem.ticker] || 
                  cached.historiqueProduit?.[liveItem.ticker_backup];
  
  if (!history) return [];
  
  const data = history['Historique Enregistré'] || [];
  
  // 3. Filtrer selon période
  const now = new Date();
  const filtered = data.filter(d => {
    const date = new Date(d.date);
    
    switch(period) {
      case '1m': return date >= new Date(now.setMonth(now.getMonth() - 1));
      case '3m': return date >= new Date(now.setMonth(now.getMonth() - 3));
      case '6m': return date >= new Date(now.setMonth(now.getMonth() - 6));
      case '1y': return date >= new Date(now.setFullYear(now.getFullYear() - 1));
      case 'ytd': return date >= new Date(now.getFullYear(), 0, 1);
      case 'max': return true;
      default: return true;
    }
  });
  
  return filtered.sort((a, b) => new Date(a.date) - new Date(b.date));
}
```

2. **Composant UI** :
```javascript
/**
 * Affiche le graphique historique d'un produit
 * @param {string} identifier - Ticker ou nom
 * @param {string} containerId - ID du conteneur canvas
 */
function renderProductHistoryChart(identifier, containerId = 'productHistoryChart') {
  const canvas = document.getElementById(containerId);
  if (!canvas) return;
  
  const history = getProductHistory(identifier, activePeriod);
  
  // Détruire instance précédente si existe
  if (window.productHistoryChartInstance) {
    window.productHistoryChartInstance.destroy();
  }
  
  const ctx = canvas.getContext('2d');
  
  // Gradient fill
  const gradient = ctx.createLinearGradient(0, 0, 0, 300);
  gradient.addColorStop(0, 'rgba(59, 130, 246, 0.2)');
  gradient.addColorStop(1, 'rgba(59, 130, 246, 0.0)');
  
  window.productHistoryChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: history.map(d => new Date(d.date).toLocaleDateString('fr-FR')),
      datasets: [{
        label: 'Cours de clôture',
        data: history.map(d => d.close),
        borderColor: '#3b82f6',
        backgroundColor: gradient,
        borderWidth: 2,
        fill: true,
        tension: 0.1,
        pointRadius: 0,
        pointHoverRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(context) {
              return 'Cours: ' + formatEuro(context.parsed.y);
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: false,
          ticks: {
            callback: function(value) {
              return formatEuro(value);
            }
          }
        },
        x: {
          grid: { display: false },
          ticks: { maxTicksLimit: 8 }
        }
      }
    }
  });
}
```

3. **Intégration dans modal historique** :
```javascript
// Modifier window.showProductHistory() dans script.js
window.showProductHistory = function(identifier) {
  const modal = document.getElementById('productHistoryModal');
  const tbody = document.getElementById('modal-history-body');
  const title = document.getElementById('modal-history-title');
  const coursEl = document.getElementById('modal-history-cours');
  
  // ... code existant pour afficher les transactions ...
  
  // ✅ AJOUT : Afficher le graphique historique
  renderProductHistoryChart(identifier);
  
  modal.style.display = 'flex';
};
```

4. **HTML à ajouter dans index.html** :
```html
<!-- Dans la modal #productHistoryModal, après la table -->
<div style="margin-top: 24px; padding-top: 24px; border-top: 1px solid var(--border);">
  <h3 style="font-size: 1rem; font-weight: 700; margin-bottom: 16px;">
    Évolution du cours
  </h3>
  <div class="period-selector">
    <button class="period-btn active" data-period="1m">1M</button>
    <button class="period-btn" data-period="3m">3M</button>
    <button class="period-btn" data-period="6m">6M</button>
    <button class="period-btn" data-period="1y">1A</button>
    <button class="period-btn" data-period="ytd">YTD</button>
    <button class="period-btn" data-period="max">MAX</button>
  </div>
  <div class="chart-container">
    <canvas id="productHistoryChart"></canvas>
  </div>
</div>
```

**Tests requis** :
- [ ] Graphique s'affiche correctement pour tous les produits
- [ ] Changement de période fonctionne
- [ ] Gestion cas produit sans historique
- [ ] Performance acceptable avec 1000+ points de données

---

#### ✅ Feature 1.2 : Graphique Chandelier (Candlestick)
**Description** : Afficher un graphique chandelier japonais avec volumes

**Implémentation** :
1. **Utiliser Chart.js Financial** (plugin séparé) :
```html
<!-- Ajouter dans index.html -->
<script src="https://cdn.jsdelivr.net/npm/chartjs-chart-financial@0.2.0"></script>
```

2. **Fonction de rendu** :
```javascript
/**
 * Affiche un graphique chandelier pour un produit
 * @param {string} identifier - Ticker ou nom
 */
function renderCandlestickChart(identifier) {
  const canvas = document.getElementById('candlestickChart');
  if (!canvas) return;
  
  const history = getProductHistory(identifier, activePeriod);
  
  if (window.candlestickChartInstance) {
    window.candlestickChartInstance.destroy();
  }
  
  const ctx = canvas.getContext('2d');
  
  window.candlestickChartInstance = new Chart(ctx, {
    type: 'candlestick',
    data: {
      datasets: [{
        label: 'Cours',
        data: history.map(d => ({
          x: new Date(d.date),
          o: d.open,
          h: d.high,
          l: d.low,
          c: d.close
        }))
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { type: 'time', time: { unit: 'day' } },
        y: { beginAtZero: false }
      }
    }
  });
}
```

---

### NIVEAU 2 : Comparaisons multi-produits (Priorité MOYENNE)

#### ✅ Feature 2.1 : Comparateur de performances
**Description** : Comparer l'évolution de plusieurs produits sur un même graphique

**Données requises** :
- Historiques de multiples produits
- Normalisation à 100 au point de départ

**Implémentation** :
```javascript
/**
 * Compare les performances de plusieurs produits
 * @param {Array<string>} identifiers - Liste de tickers/noms
 * @param {string} period - Période de comparaison
 */
function compareProductsPerformance(identifiers, period = '1y') {
  const datasets = [];
  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
  
  identifiers.forEach((id, index) => {
    const history = getProductHistory(id, period);
    
    if (history.length === 0) return;
    
    // Normaliser à 100 au premier point
    const baseValue = history[0].close;
    const normalizedData = history.map(d => ({
      x: new Date(d.date),
      y: ((d.close - baseValue) / baseValue) * 100
    }));
    
    const liveItem = findLiveItem(id);
    const name = liveItem?.liste_produits || id;
    
    datasets.push({
      label: name,
      data: normalizedData,
      borderColor: colors[index % colors.length],
      borderWidth: 2,
      fill: false,
      tension: 0.1,
      pointRadius: 0
    });
  });
  
  // Créer le graphique
  const canvas = document.getElementById('comparisonChart');
  if (!canvas) return;
  
  if (window.comparisonChartInstance) {
    window.comparisonChartInstance.destroy();
  }
  
  window.comparisonChartInstance = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: function(context) {
              return `${context.dataset.label}: ${context.parsed.y.toFixed(2)}%`;
            }
          }
        }
      },
      scales: {
        x: { type: 'time', time: { unit: 'day' } },
        y: {
          ticks: {
            callback: function(value) {
              return value + '%';
            }
          }
        }
      }
    }
  });
}
```

**UI à ajouter** :
```html
<!-- Nouvel onglet ou section dans "Analyse" -->
<div class="card card-highlight">
  <h3>Comparateur de performances</h3>
  
  <!-- Sélecteur de produits -->
  <div style="margin-bottom: 16px;">
    <label>Produits à comparer (max 5)</label>
    <select id="compare-products" multiple size="5">
      <!-- Options générées dynamiquement depuis globalLive -->
    </select>
  </div>
  
  <div class="period-selector">
    <button class="period-btn active" data-period="1m">1M</button>
    <button class="period-btn" data-period="3m">3M</button>
    <button class="period-btn" data-period="6m">6M</button>
    <button class="period-btn" data-period="1y">1A</button>
    <button class="period-btn" data-period="ytd">YTD</button>
    <button class="period-btn" data-period="max">MAX</button>
  </div>
  
  <button class="btn btn-primary" onclick="runComparison()">
    Comparer
  </button>
  
  <div class="chart-container" style="margin-top: 16px;">
    <canvas id="comparisonChart"></canvas>
  </div>
</div>
```

---

#### ✅ Feature 2.2 : Matrice de corrélation
**Description** : Calculer et afficher les corrélations entre produits du portefeuille

**Implémentation** :
```javascript
/**
 * Calcule la corrélation de Pearson entre deux séries
 * @param {Array<number>} x - Série 1
 * @param {Array<number>} y - Série 2
 * @returns {number} Coefficient de corrélation (-1 à 1)
 */
function calculateCorrelation(x, y) {
  const n = Math.min(x.length, y.length);
  if (n === 0) return 0;
  
  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;
  
  let numerator = 0;
  let denomX = 0;
  let denomY = 0;
  
  for (let i = 0; i < n; i++) {
    const diffX = x[i] - meanX;
    const diffY = y[i] - meanY;
    numerator += diffX * diffY;
    denomX += diffX * diffX;
    denomY += diffY * diffY;
  }
  
  if (denomX === 0 || denomY === 0) return 0;
  
  return numerator / Math.sqrt(denomX * denomY);
}

/**
 * Génère la matrice de corrélation du portefeuille
 * @param {string} period - Période d'analyse
 * @returns {Object} { labels: [], matrix: [[]] }
 */
function generateCorrelationMatrix(period = '1y') {
  const products = globalLive.filter(item => item.unité > 0);
  const labels = products.map(p => p.liste_produits);
  const n = products.length;
  const matrix = Array(n).fill(null).map(() => Array(n).fill(0));
  
  // Récupérer les séries de prix
  const series = products.map(p => {
    const history = getProductHistory(p.ticker, period);
    return history.map(d => d.close);
  });
  
  // Calculer corrélations
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) {
        matrix[i][j] = 1;
      } else {
        matrix[i][j] = calculateCorrelation(series[i], series[j]);
      }
    }
  }
  
  return { labels, matrix };
}

/**
 * Affiche la matrice de corrélation (heatmap)
 */
function renderCorrelationHeatmap() {
  const { labels, matrix } = generateCorrelationMatrix();
  const container = document.getElementById('correlation-container');
  
  if (!container) return;
  
  // Générer HTML de la heatmap
  let html = `
    <table class="correlation-matrix">
      <thead>
        <tr>
          <th></th>
          ${labels.map(l => `<th>${l}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
  `;
  
  matrix.forEach((row, i) => {
    html += `<tr><th>${labels[i]}</th>`;
    row.forEach(value => {
      const color = getCorrelationColor(value);
      html += `<td style="background-color: ${color};" title="${value.toFixed(3)}">
        ${value.toFixed(2)}
      </td>`;
    });
    html += '</tr>';
  });
  
  html += '</tbody></table>';
  container.innerHTML = html;
}

/**
 * Retourne une couleur selon le coefficient de corrélation
 * @param {number} value - Corrélation (-1 à 1)
 * @returns {string} Code couleur
 */
function getCorrelationColor(value) {
  if (value >= 0.7) return '#10b981'; // Vert fort
  if (value >= 0.3) return '#6ee7b7'; // Vert clair
  if (value >= -0.3) return '#f3f4f6'; // Gris
  if (value >= -0.7) return '#fca5a5'; // Rouge clair
  return '#ef4444'; // Rouge fort
}
```

**CSS à ajouter** :
```css
.correlation-matrix {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
}

.correlation-matrix th,
.correlation-matrix td {
  padding: 8px;
  text-align: center;
  border: 1px solid var(--border);
}

.correlation-matrix th {
  background: var(--bg);
  font-weight: 700;
  writing-mode: vertical-lr;
  transform: rotate(180deg);
}

.correlation-matrix td {
  color: var(--text);
  font-weight: 600;
}
```

---

### NIVEAU 3 : Analyses techniques avancées (Priorité BASSE)

#### ✅ Feature 3.1 : Moyennes mobiles (SMA, EMA)
**Description** : Calculer et afficher moyennes mobiles simples et exponentielles

**Implémentation** :
```javascript
/**
 * Calcule la moyenne mobile simple (SMA)
 * @param {Array<number>} data - Série de prix
 * @param {number} period - Période (ex: 20, 50, 200)
 * @returns {Array<number>} SMA
 */
function calculateSMA(data, period) {
  const sma = [];
  
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      sma.push(null);
    } else {
      const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      sma.push(sum / period);
    }
  }
  
  return sma;
}

/**
 * Calcule la moyenne mobile exponentielle (EMA)
 * @param {Array<number>} data - Série de prix
 * @param {number} period - Période
 * @returns {Array<number>} EMA
 */
function calculateEMA(data, period) {
  const ema = [];
  const multiplier = 2 / (period + 1);
  
  // Premier EMA = SMA
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i];
    ema.push(null);
  }
  ema[period - 1] = sum / period;
  
  // EMA suivants
  for (let i = period; i < data.length; i++) {
    ema.push((data[i] - ema[i - 1]) * multiplier + ema[i - 1]);
  }
  
  return ema;
}

/**
 * Ajoute les moyennes mobiles au graphique historique
 */
function renderProductHistoryWithMA(identifier, periods = [20, 50, 200]) {
  const history = getProductHistory(identifier, activePeriod);
  const closePrices = history.map(d => d.close);
  const dates = history.map(d => new Date(d.date).toLocaleDateString('fr-FR'));
  
  const datasets = [{
    label: 'Cours',
    data: closePrices,
    borderColor: '#3b82f6',
    borderWidth: 2,
    fill: false,
    tension: 0.1,
    pointRadius: 0
  }];
  
  // Ajouter SMA pour chaque période
  const colors = ['#10b981', '#f59e0b', '#ef4444'];
  periods.forEach((period, index) => {
    const sma = calculateSMA(closePrices, period);
    datasets.push({
      label: `SMA ${period}`,
      data: sma,
      borderColor: colors[index],
      borderWidth: 1.5,
      borderDash: [5, 5],
      fill: false,
      tension: 0.1,
      pointRadius: 0
    });
  });
  
  // Créer graphique
  const canvas = document.getElementById('productHistoryChart');
  if (window.productHistoryChartInstance) {
    window.productHistoryChartInstance.destroy();
  }
  
  window.productHistoryChartInstance = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { labels: dates, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: { position: 'bottom' }
      },
      scales: {
        y: {
          beginAtZero: false,
          ticks: { callback: value => formatEuro(value) }
        }
      }
    }
  });
}
```

---

#### ✅ Feature 3.2 : RSI (Relative Strength Index)
**Description** : Indicateur de surachat/survente

**Implémentation** :
```javascript
/**
 * Calcule le RSI (Relative Strength Index)
 * @param {Array<number>} closePrices - Prix de clôture
 * @param {number} period - Période (défaut: 14)
 * @returns {Array<number>} RSI (0-100)
 */
function calculateRSI(closePrices, period = 14) {
  const rsi = [];
  
  // Calculer les variations
  const changes = [];
  for (let i = 1; i < closePrices.length; i++) {
    changes.push(closePrices[i] - closePrices[i - 1]);
  }
  
  // Calculer gains et pertes moyens
  for (let i = 0; i < changes.length; i++) {
    if (i < period) {
      rsi.push(null);
    } else {
      const recentChanges = changes.slice(i - period, i);
      const gains = recentChanges.filter(c => c > 0).reduce((a, b) => a + b, 0) / period;
      const losses = Math.abs(recentChanges.filter(c => c < 0).reduce((a, b) => a + b, 0)) / period;
      
      if (losses === 0) {
        rsi.push(100);
      } else {
        const rs = gains / losses;
        rsi.push(100 - (100 / (1 + rs)));
      }
    }
  }
  
  return [null, ...rsi]; // Ajouter null au début pour aligner avec closePrices
}

/**
 * Affiche le RSI sous le graphique principal
 */
function renderRSIChart(identifier) {
  const history = getProductHistory(identifier, activePeriod);
  const closePrices = history.map(d => d.close);
  const rsi = calculateRSI(closePrices);
  const dates = history.map(d => new Date(d.date).toLocaleDateString('fr-FR'));
  
  const canvas = document.getElementById('rsiChart');
  if (!canvas) return;
  
  if (window.rsiChartInstance) {
    window.rsiChartInstance.destroy();
  }
  
  window.rsiChartInstance = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: dates,
      datasets: [{
        label: 'RSI',
        data: rsi,
        borderColor: '#8b5cf6',
        borderWidth: 2,
        fill: false,
        tension: 0.1,
        pointRadius: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        annotation: {
          annotations: {
            overbought: {
              type: 'line',
              yMin: 70,
              yMax: 70,
              borderColor: '#ef4444',
              borderWidth: 1,
              borderDash: [5, 5],
              label: {
                content: 'Surachat (70)',
                enabled: true,
                position: 'end'
              }
            },
            oversold: {
              type: 'line',
              yMin: 30,
              yMax: 30,
              borderColor: '#10b981',
              borderWidth: 1,
              borderDash: [5, 5],
              label: {
                content: 'Survente (30)',
                enabled: true,
                position: 'end'
              }
            }
          }
        }
      },
      scales: {
        y: {
          min: 0,
          max: 100,
          ticks: {
            callback: value => value.toFixed(0)
          }
        }
      }
    }
  });
}
```

---

#### ✅ Feature 3.3 : Bandes de Bollinger
**Description** : Visualiser la volatilité avec les bandes de Bollinger

**Implémentation** :
```javascript
/**
 * Calcule les Bandes de Bollinger
 * @param {Array<number>} closePrices - Prix de clôture
 * @param {number} period - Période (défaut: 20)
 * @param {number} stdDev - Écart-type (défaut: 2)
 * @returns {Object} { middle, upper, lower }
 */
function calculateBollingerBands(closePrices, period = 20, stdDev = 2) {
  const middle = calculateSMA(closePrices, period);
  const upper = [];
  const lower = [];
  
  for (let i = 0; i < closePrices.length; i++) {
    if (i < period - 1) {
      upper.push(null);
      lower.push(null);
    } else {
      const slice = closePrices.slice(i - period + 1, i + 1);
      const mean = middle[i];
      
      // Calculer écart-type
      const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
      const sd = Math.sqrt(variance);
      
      upper.push(mean + (stdDev * sd));
      lower.push(mean - (stdDev * sd));
    }
  }
  
  return { middle, upper, lower };
}

/**
 * Affiche le graphique avec Bandes de Bollinger
 */
function renderBollingerBandsChart(identifier) {
  const history = getProductHistory(identifier, activePeriod);
  const closePrices = history.map(d => d.close);
  const dates = history.map(d => new Date(d.date).toLocaleDateString('fr-FR'));
  const { middle, upper, lower } = calculateBollingerBands(closePrices);
  
  const canvas = document.getElementById('productHistoryChart');
  if (window.productHistoryChartInstance) {
    window.productHistoryChartInstance.destroy();
  }
  
  window.productHistoryChartInstance = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: dates,
      datasets: [
        {
          label: 'Cours',
          data: closePrices,
          borderColor: '#3b82f6',
          borderWidth: 2,
          fill: false,
          tension: 0.1,
          pointRadius: 0,
          order: 1
        },
        {
          label: 'BB Supérieure',
          data: upper,
          borderColor: '#ef4444',
          borderWidth: 1,
          borderDash: [5, 5],
          fill: '+1',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          tension: 0.1,
          pointRadius: 0,
          order: 2
        },
        {
          label: 'BB Moyenne',
          data: middle,
          borderColor: '#64748b',
          borderWidth: 1,
          borderDash: [2, 2],
          fill: false,
          tension: 0.1,
          pointRadius: 0,
          order: 3
        },
        {
          label: 'BB Inférieure',
          data: lower,
          borderColor: '#10b981',
          borderWidth: 1,
          borderDash: [5, 5],
          fill: false,
          tension: 0.1,
          pointRadius: 0,
          order: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: { position: 'bottom' }
      },
      scales: {
        y: {
          beginAtZero: false,
          ticks: { callback: value => formatEuro(value) }
        }
      }
    }
  });
}
```

---

### NIVEAU 4 : Simulations et optimisations (Priorité FUTURE)

#### ✅ Feature 4.1 : Simulateur de performance
**Description** : Simuler la performance d'un investissement sur l'historique

**Exemple d'usage** :
> "Et si j'avais investi 1000€ dans ce produit il y a 1 an ?"

**Implémentation** :
```javascript
/**
 * Simule un investissement passé
 * @param {string} identifier - Ticker/nom du produit
 * @param {number} amount - Montant investi (€)
 * @param {string} startDate - Date début (YYYY-MM-DD)
 * @param {string} endDate - Date fin (YYYY-MM-DD) - optionnel
 * @returns {Object} Résultats de simulation
 */
function simulateInvestment(identifier, amount, startDate, endDate = null) {
  const history = getProductHistory(identifier, 'max');
  
  // Trouver prix d'achat
  const buyPoint = history.find(d => d.date >= startDate);
  if (!buyPoint) return null;
  
  const buyPrice = buyPoint.close;
  const shares = amount / buyPrice;
  
  // Trouver prix de vente
  const sellPoint = endDate 
    ? history.find(d => d.date >= endDate) 
    : history[history.length - 1];
  
  const sellPrice = sellPoint.close;
  const finalValue = shares * sellPrice;
  
  // Calculer dividendes reçus pendant la période
  const dividends = globalDividendes.filter(d => {
    const divDate = new Date(d.date);
    return divDate >= new Date(startDate) && 
           divDate <= new Date(sellPoint.date) &&
           (d.code === identifier || d.nom === identifier);
  });
  
  const totalDividends = dividends.reduce((sum, d) => {
    return sum + (shares * parseDividende(d["div/u"]));
  }, 0);
  
  const totalReturn = finalValue + totalDividends - amount;
  const returnPercent = (totalReturn / amount) * 100;
  
  // Calculer rendement annualisé
  const days = Math.ceil((new Date(sellPoint.date) - new Date(buyPoint.date)) / (1000 * 60 * 60 * 24));
  const years = days / 365.25;
  const annualizedReturn = (Math.pow(1 + (totalReturn / amount), 1 / years) - 1) * 100;
  
  return {
    buyDate: buyPoint.date,
    buyPrice,
    sellDate: sellPoint.date,
    sellPrice,
    shares,
    invested: amount,
    finalValue,
    totalDividends,
    totalReturn,
    returnPercent,
    annualizedReturn,
    days
  };
}

/**
 * Affiche les résultats de simulation
 */
function renderSimulationResults(results) {
  const container = document.getElementById('simulation-results');
  if (!container) return;
  
  container.innerHTML = `
    <div class="card card-highlight">
      <h3>Résultats de simulation</h3>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 16px;">
        <div>
          <div class="text-muted text-sm">Date d'achat</div>
          <div class="font-bold">${formatDate(results.buyDate)}</div>
          <div class="text-muted text-sm" style="margin-top: 4px;">
            Prix: ${formatEuro(results.buyPrice)} × ${results.shares.toFixed(2)} actions
          </div>
        </div>
        
        <div>
          <div class="text-muted text-sm">Date de vente</div>
          <div class="font-bold">${formatDate(results.sellDate)}</div>
          <div class="text-muted text-sm" style="margin-top: 4px;">
            Prix: ${formatEuro(results.sellPrice)}
          </div>
        </div>
      </div>
      
      <div style="margin-top: 24px; padding: 16px; background: var(--bg); border-radius: 12px;">
        <div class="pos-row">
          <span class="text-muted">Investi</span>
          <span class="font-bold">${formatEuro(results.invested)}</span>
        </div>
        <div class="pos-row">
          <span class="text-muted">Valeur finale</span>
          <span class="font-bold">${formatEuro(results.finalValue)}</span>
        </div>
        <div class="pos-row">
          <span class="text-muted">Dividendes reçus</span>
          <span class="font-bold text-success">${formatEuro(results.totalDividends)}</span>
        </div>
        <div style="border-top: 1px dashed var(--border); margin: 8px 0;"></div>
        <div class="pos-row">
          <span class="font-bold">Gain/Perte total</span>
          <span class="font-bold ${results.totalReturn >= 0 ? 'text-success' : 'text-danger'}">
            ${results.totalReturn >= 0 ? '+' : ''}${formatEuro(results.totalReturn)}
          </span>
        </div>
        <div class="pos-row">
          <span class="font-bold">Performance</span>
          <span class="font-bold ${results.returnPercent >= 0 ? 'text-success' : 'text-danger'}">
            ${results.returnPercent >= 0 ? '+' : ''}${results.returnPercent.toFixed(2)}%
          </span>
        </div>
        <div class="pos-row">
          <span class="text-muted text-sm">Rendement annualisé</span>
          <span class="font-bold ${results.annualizedReturn >= 0 ? 'text-success' : 'text-danger'}">
            ${results.annualizedReturn.toFixed(2)}% / an
          </span>
        </div>
        <div class="pos-row">
          <span class="text-muted text-sm">Durée</span>
          <span class="text-muted">${results.days} jours</span>
        </div>
      </div>
    </div>
  `;
}
```

**UI à ajouter** :
```html
<div class="card card-highlight">
  <h3>Simulateur d'investissement</h3>
  <p class="text-muted text-sm">Simule un investissement passé sur un produit</p>
  
  <div class="input-group">
    <label>Produit</label>
    <select id="sim-product">
      <!-- Options générées depuis globalLive -->
    </select>
  </div>
  
  <div class="input-group">
    <label>Montant investi</label>
    <input type="number" id="sim-amount" placeholder="1000" step="100">
  </div>
  
  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
    <div class="input-group">
      <label>Date début</label>
      <input type="date" id="sim-start-date">
    </div>
    <div class="input-group">
      <label>Date fin (optionnel)</label>
      <input type="date" id="sim-end-date">
    </div>
  </div>
  
  <button class="btn btn-primary" onclick="runSimulation()">
    Lancer simulation
  </button>
  
  <div id="simulation-results" style="margin-top: 24px;"></div>
</div>
```

---

#### ✅ Feature 4.2 : Dollar Cost Averaging (DCA) Optimizer
**Description** : Analyser l'efficacité d'une stratégie DCA passée

**Implémentation** :
```javascript
/**
 * Simule une stratégie DCA (Dollar Cost Averaging)
 * @param {string} identifier - Ticker/nom
 * @param {number} monthlyAmount - Montant mensuel investi
 * @param {string} startDate - Date début
 * @param {string} endDate - Date fin
 * @param {number} dayOfMonth - Jour du mois (1-28)
 * @returns {Object} Résultats DCA
 */
function simulateDCA(identifier, monthlyAmount, startDate, endDate, dayOfMonth = 1) {
  const history = getProductHistory(identifier, 'max');
  
  let totalInvested = 0;
  let totalShares = 0;
  const purchases = [];
  
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : new Date();
  
  let currentDate = new Date(start.getFullYear(), start.getMonth(), dayOfMonth);
  
  while (currentDate <= end) {
    // Trouver le prix le jour J ou jour suivant
    const purchasePoint = history.find(d => new Date(d.date) >= currentDate);
    
    if (purchasePoint) {
      const price = purchasePoint.close;
      const shares = monthlyAmount / price;
      
      totalInvested += monthlyAmount;
      totalShares += shares;
      
      purchases.push({
        date: purchasePoint.date,
        price,
        shares,
        amount: monthlyAmount
      });
    }
    
    // Prochain mois
    currentDate.setMonth(currentDate.getMonth() + 1);
  }
  
  // Valeur finale
  const finalPrice = history[history.length - 1].close;
  const finalValue = totalShares * finalPrice;
  
  // Prix moyen d'achat
  const avgPrice = totalInvested / totalShares;
  
  // Performance
  const totalReturn = finalValue - totalInvested;
  const returnPercent = (totalReturn / totalInvested) * 100;
  
  // Comparer avec investissement lump sum
  const lumpSumShares = totalInvested / history[0].close;
  const lumpSumValue = lumpSumShares * finalPrice;
  const lumpSumReturn = ((lumpSumValue - totalInvested) / totalInvested) * 100;
  
  return {
    purchases,
    totalInvested,
    totalShares,
    avgPrice,
    finalPrice,
    finalValue,
    totalReturn,
    returnPercent,
    lumpSumComparison: {
      value: lumpSumValue,
      return: lumpSumReturn,
      difference: lumpSumValue - finalValue
    }
  };
}
```

---

## 🛠️ GUIDES D'IMPLÉMENTATION POUR AGENTS IA

### Template de feature complète

Pour chaque nouvelle fonctionnalité, suivre cette structure :

```javascript
// ========================================
// FEATURE: [Nom de la feature]
// Description: [Description courte]
// Niveau: [1-4]
// ========================================

// 1. HELPER FUNCTIONS
/**
 * [Description de la fonction]
 * @param {type} paramName - Description
 * @returns {type} Description du retour
 */
function helperFunction(params) {
  // Implémentation
}

// 2. CORE LOGIC
/**
 * Fonction principale de la feature
 */
function mainFeatureFunction(params) {
  // 1. Validation des données
  if (!params) return null;
  
  // 2. Récupération des données historiques
  const history = getProductHistory(identifier, period);
  
  // 3. Traitement des données
  const result = processData(history);
  
  // 4. Retour du résultat
  return result;
}

// 3. UI RENDERING
/**
 * Affiche les résultats dans l'interface
 */
function renderFeatureResults(data) {
  const container = document.getElementById('feature-container');
  if (!container) return;
  
  // Générer HTML
  container.innerHTML = `...`;
}

// 4. EVENT LISTENERS
/**
 * Configure les événements utilisateur
 */
function setupFeatureEvents() {
  const btn = document.getElementById('feature-btn');
  if (btn) {
    btn.addEventListener('click', () => {
      const data = mainFeatureFunction(params);
      renderFeatureResults(data);
    });
  }
}

// 5. INTEGRATION
/**
 * Point d'entrée de la feature dans setupEventListeners()
 */
// À ajouter dans setupEventListeners():
// setupFeatureEvents();
```

### Checklist de développement

Pour chaque feature :

- [ ] **Phase 1 : Planification**
  - [ ] Définir les données requises
  - [ ] Identifier les dépendances (helpers existants)
  - [ ] Dessiner le wireframe UI
  - [ ] Estimer complexité (1-5)

- [ ] **Phase 2 : Implémentation Backend**
  - [ ] Coder les helpers de calcul
  - [ ] Implémenter la logique métier
  - [ ] Gérer les cas limites (données manquantes, erreurs)
  - [ ] Ajouter des logs de debug

- [ ] **Phase 3 : Implémentation Frontend**
  - [ ] Créer le HTML nécessaire
  - [ ] Ajouter le CSS spécifique
  - [ ] Implémenter le rendu des résultats
  - [ ] Configurer les event listeners

- [ ] **Phase 4 : Tests**
  - [ ] Tester avec plusieurs produits
  - [ ] Tester avec données manquantes
  - [ ] Tester performance (>1000 points)
  - [ ] Tester responsive mobile

- [ ] **Phase 5 : Documentation**
  - [ ] Commenter le code
  - [ ] Mettre à jour README.md
  - [ ] Ajouter exemple d'usage
  - [ ] Documenter limitations

---

## 🎯 PRIORISATION DES FEATURES

### Sprint 1 (Priorité HAUTE - 2 semaines)
1. ✅ Feature 1.1 : Graphique historique simple
2. ✅ Feature 1.2 : Graphique chandelier

**Objectif** : Visualisation basique des historiques de cours

### Sprint 2 (Priorité MOYENNE - 2 semaines)
1. ✅ Feature 2.1 : Comparateur de performances
2. ✅ Feature 2.2 : Matrice de corrélation

**Objectif** : Analyses comparatives entre produits

### Sprint 3 (Priorité BASSE - 3 semaines)
1. ✅ Feature 3.1 : Moyennes mobiles (SMA/EMA)
2. ✅ Feature 3.2 : RSI
3. ✅ Feature 3.3 : Bandes de Bollinger

**Objectif** : Indicateurs techniques de trading

### Sprint 4 (Priorité FUTURE - 3 semaines)
1. ✅ Feature 4.1 : Simulateur de performance
2. ✅ Feature 4.2 : DCA Optimizer

**Objectif** : Simulations et optimisations avancées

---

## 📚 RESSOURCES UTILES

### Librairies recommandées

1. **Chart.js Financial** (Candlestick)
   - URL: https://github.com/chartjs/chartjs-chart-financial
   - Usage: Graphiques chandelier et OHLC

2. **Chart.js Annotation Plugin**
   - URL: https://www.chartjs.org/chartjs-plugin-annotation/
   - Usage: Lignes horizontales (RSI 70/30)

3. **TechnicalIndicators.js**
   - URL: https://github.com/anandanand84/technicalindicators
   - Usage: Calculs indicateurs techniques (RSI, MACD, etc.)

### Documentation

- [Chart.js Docs](https://www.chartjs.org/docs/latest/)
- [MDN - Canvas API](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
- [Investopedia - Technical Indicators](https://www.investopedia.com/terms/t/technicalindicator.asp)

---

## ⚠️ LIMITATIONS ET CONTRAINTES

### Données historiques
- ❌ **Pas d'accès temps réel** : Historique enregistré uniquement
- ❌ **Pas de données intraday** : Seulement OHLC journalier
- ❌ **Gaps possibles** : Historique peut avoir des trous
- ✅ **Format standardisé** : OHLCV cohérent

### Performance
- ⚠️ **Limite 1000 points** : Au-delà, envisager sampling
- ⚠️ **Calculs lourds** : SMA/EMA sur 5 ans = lent
- ✅ **Cache recommandé** : Stocker calculs intermédiaires

### UI/UX
- ⚠️ **Mobile limité** : Graphiques complexes difficiles sur petit écran
- ✅ **Responsive requis** : Toutes features doivent être mobile-friendly
- ✅ **Loading states** : Afficher loaders pour calculs longs

---

## 🔄 MAINTENANCE ET ÉVOLUTIONS

### Mise à jour des données
- Synchronisation historique automatique via `verifyHistoricalData()`
- Vérification des incohérences entre "Enregistré" et "Non Enregistré"
- Proposition de sync si > 10 lignes manquantes

### Tests de régression
Tester après chaque nouvelle feature :
- [ ] Dashboard fonctionne toujours
- [ ] Graphiques existants OK
- [ ] Pas de ralentissement global
- [ ] Cache fonctionne correctement

### Optimisations futures
- IndexedDB pour historiques lourds (> 10 000 points)
- Web Workers pour calculs intensifs
- Lazy loading des graphiques
- Compression des données en cache

---

## ✅ CHECKLIST DE FIN DE DÉVELOPPEMENT

Avant de merger une feature :

- [ ] Code commenté et lisible
- [ ] Pas de `console.log` en production
- [ ] Gestion des erreurs (try/catch)
- [ ] Tests manuels effectués
- [ ] Performance acceptable (< 2s)
- [ ] Responsive mobile testé
- [ ] Documentation mise à jour
- [ ] Commit message descriptif

---

## 📝 NOTES TECHNIQUES

### Accès aux données historiques

```javascript
// ✅ CORRECT - Depuis le cache
const cached = JSON.parse(localStorage.getItem('pea_data_cache') || '{}');
const history = cached.historiqueProduit?.[ticker]?.['Historique Enregistré'];

// ❌ INCORRECT - Depuis result (non disponible partout)
const history = result.historiqueProduit[ticker];
```

### Gestion des périodes

```javascript
// Helper pour calculer date limite selon période
function getPeriodStartDate(period) {
  const now = new Date();
  switch(period) {
    case '1m': return new Date(now.setMonth(now.getMonth() - 1));
    case '3m': return new Date(now.setMonth(now.getMonth() - 3));
    case '6m': return new Date(now.setMonth(now.getMonth() - 6));
    case '1y': return new Date(now.setFullYear(now.getFullYear() - 1));
    case 'ytd': return new Date(now.getFullYear(), 0, 1);
    case 'max': return new Date(0); // Epoch
    default: return new Date(0);
  }
}
```

### Performance - Sampling pour gros datasets

```javascript
/**
 * Réduit un dataset en conservant max N points
 * Utilise LTTB (Largest Triangle Three Buckets)
 */
function downsampleData(data, maxPoints = 500) {
  if (data.length <= maxPoints) return data;
  
  const step = Math.floor(data.length / maxPoints);
  const downsampled = [];
  
  for (let i = 0; i < data.length; i += step) {
    downsampled.push(data[i]);
  }
  
  return downsampled;
}
```

---

**Dernière mise à jour** : 30 janvier 2026  
**Version** : 3.0  
**Auteur** : Dashboard PEA Team

---

🚀 **Ready for AI Implementation!**