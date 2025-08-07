function onLoad() {
    const choose = document.querySelector('input[name="image"]');
    const loadDemoButton = document.querySelector('button[demo]');
    const loadDemoBigButton = document.querySelector('button[demo-big]');
    const tileWidthInput = document.querySelector('input[name="tile-width"]');
    const tileHeightInput = document.querySelector('input[name="tile-height"]');
    const toleranceInput = document.querySelector('input[name="tolerance"]');
    const paletteIndexInput = document.querySelector('input[name="pindex"]');
    const paletteInput = document.querySelector('input[name="palette"]');
    const colorsInput = document.querySelector('input[name="colors"]');
    const progress = document.querySelector('progress');
    const consoleLayer = document.querySelector('div[console]');
    const tilesLayer = document.querySelector('div[tiles]');
    const tilesetLayer = document.querySelector('div[tileset]');
    const resultLayer = document.querySelector('div[result]');
    const downloadMapLink = document.querySelector("a[download-map]");
    const downloadTilesLink = document.querySelector("a[download-tiles]");
    const downloadTileMapLink = document.querySelector("a[download-tilemap]");
    const downloadTiledTMXLink = document.querySelector("a[download-tmx]");


    const loadPaletteButton = document.getElementById('load-palette');
    const paletteFileInput = document.getElementById('palette-file');
    const paletteFileName = document.getElementById('palette-file-name');

    loadPaletteButton.addEventListener('click', function () {
        paletteFileInput.click();
    });

    let paletteFile = null; // Armazena a referência ao arquivo de paletas

    // Modifique o handler do input de paletas
    paletteFileInput.addEventListener('change', function (e) {
        paletteFile = e.target.files[0];
        if (paletteFile) {
            paletteFileName.textContent = paletteFile.name;
        } else {
            paletteFileName.textContent = "No file selected";
        }
    });


    let map = null;
    let tiles = null;
    let source = null;
    let worker = null;
    let paletteLoaded = false;
    let sourceWidth = 0;
    let sourceHeight = 0;
    let numCols = 0;
    let numRows = 0;
    let tileWidth = 0;
    let tileHeight = 0;
    let paletteIndex = 0;
    let paletteSize = 0;
    let totalColors = 0;
    let extractedTilesWidth = 0;
    let extractedTilesHeight = 0;

    function reset() {
        if (worker) {
            worker.terminate();
            worker = null;
        }
        map = null;
        tiles = null;
        consoleLayer.innerHTML = "";
        tilesLayer.innerHTML = "";
        tilesetLayer.innerHTML = "";
        progress.value = 0;
        resultLayer.setAttribute("hidden", "");
    }

    function fullReset() {
        reset();
        source = null;
        sourceWidth = 0;
        sourceHeight = 0;
        numCols = 0;
        numRows = 0;
        tileWidth = 0;
        tileHeight = 0;
        paletteIndex = 0
        paletteSize = 0;
        totalColors = 0;
        extractedTilesWidth = 0;
        extractedTilesHeight = 0;
    }

    function log(header, content) {
        const line = document.createElement("p");
        line.setAttribute("fine", "");
        const spanHeader = document.createElement("span");
        spanHeader.textContent = header;
        const spanContent = document.createElement("span");
        spanContent.textContent = content;
        line.appendChild(spanHeader);
        line.appendChild(spanContent);
        consoleLayer.appendChild(line);
    }

    function error(msg) {
        const line = document.createElement("p");
        line.setAttribute("error", "");
        line.textContent = msg;
        consoleLayer.appendChild(line);
    }

    function checkSourceSize() {
        if (0 === numCols || numCols !== Math.floor(numCols)) {
            error("image-width not dividable by tile-width.");
            return false;
        }
        if (0 === numRows || numRows !== Math.floor(numRows)) {
            error("image-height not dividable by tile-height.");
            return false;
        }
        return true;
    }

    function readUI() {
        tileWidth = tileWidthInput.value | 0;
        tileHeight = tileHeightInput.value | 0;
        paletteIndex = paletteIndexInput.value | 0;
        paletteSize = paletteInput.value | 0;
        totalColors = colorsInput.value | 0;
        if (source) {
            sourceWidth = source.width;
            sourceHeight = source.height;
            numCols = sourceWidth / tileWidth;
            numRows = sourceHeight / tileHeight;
        }
    }

    function extract(src) {
        source = new Image();
        source.src = src;
        source.onload = function () {
            readUI();
            if (checkSourceSize()) {
                beginExtractionWorker();
            }
        };
        source.onError = function () {
            error("Could not load image.");
        };
    }

    function extractSourceData(source) {
        const canvas = document.createElement("canvas");
        canvas.setAttribute("width", source.width);
        canvas.setAttribute("height", source.height);
        const context = canvas.getContext("2d");
        context.drawImage(source, 0, 0, source.width, source.height);
        return context.getImageData(0, 0, source.width, source.height);
    }

    function exportTiledFormat() {
        const xmlMap = document.createElement("map");
        xmlMap.setAttribute("version", "1.0");
        xmlMap.setAttribute("orientation", "orthogonal");
        xmlMap.setAttribute("renderorder", "right-down");
        xmlMap.setAttribute("width", numCols);
        xmlMap.setAttribute("height", numRows);
        xmlMap.setAttribute("tilewidth", tileWidth);
        xmlMap.setAttribute("tileheight", tileHeight);
        xmlMap.setAttribute("nextobjectid", "1");
        const xmlTileSet = document.createElement("tileset");
        xmlTileSet.setAttribute("firstgid", "1");
        xmlTileSet.setAttribute("name", "tiles");
        xmlTileSet.setAttribute("tilewidth", tileWidth);
        xmlTileSet.setAttribute("tileheight", tileHeight);
        const xmlImage = document.createElement("image");
        xmlImage.setAttribute("source", "tileset.png");
        xmlImage.setAttribute("width", extractedTilesWidth);
        xmlImage.setAttribute("height", extractedTilesHeight);
        xmlTileSet.appendChild(xmlImage);
        const xmlTileProperty = document.createElement("image");
        xmlImage.setAttribute("source", "tileset.png");
        xmlImage.setAttribute("width", extractedTilesWidth);
        xmlImage.setAttribute("height", extractedTilesHeight);
        xmlTileSet.appendChild(xmlTileProperty);
        for (let i = 0; i < tiles.length; i++) {
            const xmlTilep = document.createElement("tile");
            xmlTilep.setAttribute("id", i.toString());

            const xmlProperties = document.createElement("properties");

            const xmlPropertyAttribute = document.createElement("property");
            xmlPropertyAttribute.setAttribute("name", "attribute");
            xmlPropertyAttribute.setAttribute("value", "0");
            xmlProperties.appendChild(xmlPropertyAttribute);

            const xmlPropertyPalette = document.createElement("property");
            xmlPropertyPalette.setAttribute("name", "palette");
            xmlPropertyPalette.setAttribute("value", palettes[i] || "0"); // Usa a paleta detectada
            xmlProperties.appendChild(xmlPropertyPalette);

            const xmlPropertyPriority = document.createElement("property");
            xmlPropertyPriority.setAttribute("name", "priority");
            xmlPropertyPriority.setAttribute("value", "0");
            xmlProperties.appendChild(xmlPropertyPriority);

            xmlTilep.appendChild(xmlProperties);
            xmlTileSet.appendChild(xmlTilep);
        }
        xmlMap.appendChild(xmlTileSet);
        const xmlLayer = document.createElement("layer");
        xmlLayer.setAttribute("name", "stage");
        xmlLayer.setAttribute("width", numCols);
        xmlLayer.setAttribute("height", numRows);
        const xmlData = document.createElement("data");
        for (let i = 0, n = map.length; i < n; ++i) {
            const xmlTile = document.createElement("tile");
            xmlTile.setAttribute("gid", (map[i] + 1) + (flipFlags[i]));
            xmlData.appendChild(xmlTile);
        }
        xmlLayer.appendChild(xmlData);
        const xmlEntities = document.createElement("objectgroup");
        xmlEntities.setAttribute("name", "entities");
        xmlMap.appendChild(xmlLayer);
        xmlMap.appendChild(xmlEntities);
        
        
        const serializer = new XMLSerializer();
        let xmlString = serializer.serializeToString(xmlMap);

        // Corrige as tags image vazias
        xmlString = xmlString.replace(/<image([^>]*)><\/image>/g, '<image$1/>');
        xmlString = xmlString.replace(/<image\/>/g, ''); // Remove tags image vazias

        return '<?xml version="1.0" encoding="UTF-8"?>\n' + xmlString;
    }
    function readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = e => resolve(e.target.result);
            reader.onerror = e => reject(new Error(`File read error: ${e.target.error.name}`));
            reader.onabort = e => reject(new Error("File read aborted"));

            try {
                reader.readAsText(file);
            } catch (e) {
                reject(new Error(`Failed to read file: ${e.message}`));
            }
        });
    }

    async function beginExtractionWorker() {
        // Carrega o conteúdo do arquivo de paletas se existir
        let paletteContent = null;
        if (paletteFile) {
            try {
                paletteContent = await readFileAsText(paletteFile);
            } catch (e) {
                error("Failed to load palette file: " + e.message);
                return;
            }
        }

        // Cria o worker
        worker = new Worker('tileset-extractor-worker.js');
        log("Size:", sourceWidth + " x " + sourceHeight + "px");
        log("Map:", numCols + " x " + numRows);

        worker.onmessage = function (event) {
            const data = event.data;
            const action = data.action;
            if (action === "extract-start") {
                progress.removeAttribute("hidden");
            } else if (action === "extract-progress") {
                progress.value = Math.min(data.progress, 1.0);
            } else if (action === "extract-result") {
                progress.setAttribute("hidden", "");
                resultLayer.removeAttribute("hidden");
                map = data.map;
                tiles = data.tiles;
                flipFlags = data.flipFlags || []; // Adiciona esta linha para receber as flags
                palettes = data.palettes || []; // Recebe as paletas detectadas
                //log("Number of tiles:", tiles.length);
                log("Time:", data.time + "ms");
                showExtractedTiles();
                showTileset();
                downloadMapLink.download = "map.json";
                downloadMapLink.href = window.URL.createObjectURL(new Blob([JSON.stringify({
                    map: map,
                    numCols: numCols,
                    numRows: numRows
                })], { type: 'text/plain' }));
                downloadTiledTMXLink.download = "tiled.tmx";
                downloadTiledTMXLink.href = window.URL.createObjectURL(new Blob([exportTiledFormat()], { type: 'text/xml' }));
            }
        };

        worker.postMessage({
            action: "extract",
            tileWidth: tileWidth,
            tileHeight: tileHeight,
            paletteIndex: paletteIndex,
            paletteSize: paletteSize,
            totalColors: totalColors,
            tolerance: toleranceInput.value * 1024,
            imageData: extractSourceData(source),
            paletteText: paletteContent // Pode ser null
        });
    }

    function showExtractedTiles() {
        for (let i = 0, n = tiles.length; i < n; ++i) {
            const canvas = document.createElement("canvas");
            canvas.setAttribute("width", tileWidth.toString());
            canvas.setAttribute("height", tileHeight.toString());
            canvas.getContext("2d").putImageData(tiles[i], 0, 0);
            tilesLayer.appendChild(canvas);
        }
        downloadTilesLink.href = createTilesDataURL();
        downloadTilesLink.download = "tileset.png";
    }

    function showTileset() {
        const canvas = document.createElement('canvas');
        canvas.setAttribute("width", sourceWidth.toString());
        canvas.setAttribute("height", sourceHeight.toString());
        const context = canvas.getContext('2d');
        let index = 0;
        for (let y = 0; y < numRows; ++y)
            for (let x = 0; x < numCols; ++x)
                context.putImageData(tiles[map[index++]], x * tileWidth, y * tileHeight);
        tilesetLayer.appendChild(canvas);
        downloadTileMapLink.href = canvas.toDataURL();
        downloadTileMapLink.download = "tilemap.png";
    }

    function createTilesDataURL() {
        // Try to get as squared as possible
        //
        const numTiles = tiles.length;
        const numRows = Math.sqrt(numTiles) | 0;
        const numCols = Math.ceil(numTiles / numRows) | 0;
        extractedTilesWidth = numCols * tileWidth;
        extractedTilesHeight = numRows * tileHeight;
        const canvas = document.createElement("canvas");
        canvas.setAttribute("width", (extractedTilesWidth).toString());
        canvas.setAttribute("height", (extractedTilesHeight).toString());
        const context = canvas.getContext('2d');
        for (let i = 0; i < numTiles; ++i) {
            const x = (i % numCols) * tileWidth;
            const y = ((i / numCols) | 0) * tileHeight;
            context.putImageData(tiles[i], x, y);
        }
        return canvas.toDataURL();
    }

    choose.addEventListener("change", function (e) {
        fullReset();
        const file = e.target.files[0];
        if (!file) {
            error("No file selected.");
            return;
        }
        if (file.type !== "image/png" && file.type !== "image/gif") {
            error("Not a png or gif file.");
            return;
        }
        extract(URL.createObjectURL(file));
    });
    loadDemoButton.addEventListener("click", function () {
        fullReset();
        extract("tileset-extractor-demo.png");
    });
    loadDemoBigButton.addEventListener("click", function () {
        fullReset();
        extract("tileset-extractor-demo-big.png");
    });
    let changeListener = () => {
        if (null === source) {
            return;
        }
        reset();
        readUI();
        beginExtractionWorker();
    };
    toleranceInput.addEventListener("change", changeListener);
    tileWidthInput.addEventListener("change", changeListener);
    tileHeightInput.addEventListener("change", changeListener);
}
