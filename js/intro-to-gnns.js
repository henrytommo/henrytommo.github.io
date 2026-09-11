// Interactive GNN hyperparameter demo.
// lookup only: every dropdown combination was pre-trained offline and saved
// under data/intro-to-gnns/. No dependencies; charts are hand-drawn SVG.
(function () {
    'use strict';

    var DATA_DIR = '../data/intro-to-gnns/';
    var PARAMS = ['hidden_channels', 'num_layers', 'lr', 'weight_decay'];
    var LABELS = {
        hidden_channels: 'Hidden channels',
        num_layers: 'Layers',
        lr: 'Learning rate',
        weight_decay: 'Weight decay',
        epochs: 'Epochs'
    };
    var DEFAULTS = { hidden_channels: 32, num_layers: 3, lr: 0.01, weight_decay: 0.0001, epochs: 100 };

    var root = document.getElementById('gnn-demo');
    if (!root) return;

    var manifest = null;
    var configCache = new Map();
    var selects = {};
    var els = {};

    // ---- DOM helpers ---------------------------------------------------

    function el(tag, attrs, parent) {
        var node = document.createElement(tag);
        if (attrs) Object.keys(attrs).forEach(function (k) {
            if (k === 'text') node.textContent = attrs[k];
            else node.setAttribute(k, attrs[k]);
        });
        if (parent) parent.appendChild(node);
        return node;
    }

    function svgEl(tag, attrs, parent) {
        var node = document.createElementNS('http://www.w3.org/2000/svg', tag);
        if (attrs) Object.keys(attrs).forEach(function (k) {
            if (k === 'text') node.textContent = attrs[k];
            else node.setAttribute(k, attrs[k]);
        });
        if (parent) parent.appendChild(node);
        return node;
    }

    function clear(node) {
        while (node.firstChild) node.removeChild(node.firstChild);
    }

    // ---- Layout --------------------------------------------------------

    function buildUI() {
        var controls = el('div', { 'class': 'gnn-controls' }, root);

        PARAMS.concat(['epochs']).forEach(function (p) {
            var values = p === 'epochs' ? manifest.snapshot_epochs : manifest.grid[p];
            var label = el('label', { 'class': 'gnn-control' }, controls);
            el('span', { text: LABELS[p] }, label);
            var sel = el('select', null, label);
            values.forEach(function (v) {
                var opt = el('option', { value: String(v), text: String(v) }, sel);
                if (v === DEFAULTS[p]) opt.selected = true;
            });
            sel.addEventListener('change', update);
            selects[p] = sel;
        });

        var readout = el('div', { 'class': 'gnn-readout' }, root);
        els.mse = el('div', { 'class': 'gnn-mse' }, readout);
        els.status = el('div', { 'class': 'gnn-status' }, readout);

        var charts = el('div', { 'class': 'gnn-charts' }, root);

        var scatterBox = el('figure', { 'class': 'gnn-chart' }, charts);
        el('figcaption', { text: 'Predicted vs. true (test set, seed 0)' }, scatterBox);
        els.scatter = svgEl('svg', { viewBox: '0 0 360 320', role: 'img' }, scatterBox);
    }

    // ---- Data ----------------------------------------------------------

    function currentId() {
        return 'h' + selects.hidden_channels.value +
            '_L' + selects.num_layers.value +
            '_lr' + selects.lr.value +
            '_wd' + selects.weight_decay.value;
    }

    function fetchConfig(id) {
        if (configCache.has(id)) return configCache.get(id);
        var p = fetch(DATA_DIR + 'configs/' + encodeURIComponent(id) + '.json')
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            });
        configCache.set(id, p);
        p.catch(function () { configCache.delete(id); });
        return p;
    }

    function update() {
        var id = currentId();
        var epoch = selects.epochs.value;

        // Whitelist: only ids present in the manifest are ever fetched.
        var summary = Object.prototype.hasOwnProperty.call(manifest.results, id)
            ? manifest.results[id][epoch] : null;
        if (!summary) {
            els.mse.textContent = 'This configuration is not available.';
            els.status.textContent = '';
            clear(els.scatter);
            return;
        }

        els.mse.textContent = 'Test MSE: ' + summary.mean.toFixed(3) +
            ' ± ' + summary.std.toFixed(3) +
            ' (mean ± std over ' + summary.n + ' seeds)';
        els.status.textContent = 'Loading…';

        fetchConfig(id).then(function (cfg) {
            if (currentId() !== id) return; // stale response
            els.status.textContent = '';
            drawScatter(els.scatter, manifest.y_true, cfg.preds[selects.epochs.value]);
        }).catch(function () {
            els.status.textContent = 'Could not load results for this configuration.';
        });
    }

    // ---- Charts --------------------------------------------------------

    var W = 360, H = 320, PAD = { l: 48, r: 12, t: 12, b: 40 };

    function linScale(d0, d1, r0, r1) {
        return function (v) { return r0 + (v - d0) / (d1 - d0) * (r1 - r0); };
    }

    function niceTicks(min, max, n) {
        var span = max - min;
        var step = Math.pow(10, Math.floor(Math.log10(span / n)));
        var err = span / n / step;
        if (err >= 5) step *= 5; else if (err >= 2) step *= 2;
        var ticks = [];
        for (var v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) ticks.push(+v.toFixed(6));
        return ticks;
    }

    function axes(svg, xTicks, yTicks, xs, ys, xLabel, yLabel, fmt) {
        var g = svgEl('g', { 'class': 'gnn-axes' }, svg);
        var x0 = PAD.l, x1 = W - PAD.r, y0 = H - PAD.b, y1 = PAD.t;
        svgEl('line', { x1: x0, y1: y0, x2: x1, y2: y0 }, g);
        svgEl('line', { x1: x0, y1: y0, x2: x0, y2: y1 }, g);
        xTicks.forEach(function (t) {
            var x = xs(t);
            svgEl('line', { x1: x, y1: y0, x2: x, y2: y0 + 4 }, g);
            svgEl('text', { x: x, y: y0 + 16, 'text-anchor': 'middle', text: fmt(t) }, g);
        });
        yTicks.forEach(function (t) {
            var y = ys(t);
            svgEl('line', { x1: x0 - 4, y1: y, x2: x0, y2: y }, g);
            svgEl('text', { x: x0 - 7, y: y + 3.5, 'text-anchor': 'end', text: fmt(t) }, g);
        });
        svgEl('text', { x: (x0 + x1) / 2, y: H - 6, 'text-anchor': 'middle', 'class': 'gnn-axis-label', text: xLabel }, g);
        svgEl('text', {
            x: 12, y: (y0 + y1) / 2, 'text-anchor': 'middle', 'class': 'gnn-axis-label',
            transform: 'rotate(-90 12 ' + (y0 + y1) / 2 + ')', text: yLabel
        }, g);
    }

    function drawScatter(svg, yTrue, yPred) {
        clear(svg);
        var all = yTrue.concat(yPred);
        var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
        var margin = (hi - lo) * 0.05;
        lo -= margin; hi += margin;

        var xs = linScale(lo, hi, PAD.l, W - PAD.r);
        var ys = linScale(lo, hi, H - PAD.b, PAD.t);
        var ticks = niceTicks(lo, hi, 5);
        axes(svg, ticks, ticks, xs, ys, 'True value', 'Predicted value', String);

        // y = x reference line
        svgEl('line', {
            x1: xs(lo), y1: ys(lo), x2: xs(hi), y2: ys(hi), 'class': 'gnn-ref'
        }, svg);

        var pts = svgEl('g', { 'class': 'gnn-points' }, svg);
        for (var i = 0; i < yTrue.length; i++) {
            svgEl('circle', { cx: xs(yTrue[i]), cy: ys(yPred[i]), r: 3 }, pts);
        }
    }

    // ---- Boot ----------------------------------------------------------

    root.textContent = 'Loading demo…';
    fetch(DATA_DIR + 'manifest.json')
        .then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        })
        .then(function (m) {
            manifest = m;
            clear(root);
            buildUI();
            update();
        })
        .catch(function () {
            root.textContent = 'Could not load the demo data.';
        });
})();
