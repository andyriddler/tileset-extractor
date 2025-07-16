let loadedPalettes = null;

function loadPalettesFromText(paletteText) {
	if (!paletteText) {
		throw new Error("Palette text is empty");
	}

	const lines = paletteText.split(/\r?\n/); // Suporta diferentes tipos de quebra de linha
	const palettes = [];
	let currentPalette = [];
	let lineNumber = 0;

	for (const line of lines) {
		lineNumber++;
		const trimmed = line.trim();

		if (!trimmed) continue; // Ignora linhas vazias

		// Verifica se a linha é um comentário (começa com #)
		if (trimmed.startsWith('#')) continue;

		// Verifica formato hexadecimal (3 ou 6 caracteres, com ou sem #)
		const hexMatch = trimmed.match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
		if (!hexMatch) {
			throw new Error(`Invalid color format at line ${lineNumber}: "${trimmed}"`);
		}

		let hexColor = hexMatch[1];
		// Converte formato 3 caracteres para 6 caracteres (ex: #RGB -> RRGGBB)
		if (hexColor.length === 3) {
			hexColor = hexColor.split('').map(c => c + c).join('');
		}

		const color = parseInt(hexColor, 16);
		if (isNaN(color)) {
			throw new Error(`Invalid color value at line ${lineNumber}: "${trimmed}"`);
		}

		currentPalette.push(color);

		// Quando completa uma paleta de 16 cores
		if (currentPalette.length === 16) {
			palettes.push(currentPalette);
			currentPalette = [];
		}
	}

	// Verifica se a última paleta está completa
	if (currentPalette.length > 0 && currentPalette.length < 16) {
		throw new Error(`Last palette is incomplete (${currentPalette.length} colors, expected 16)`);
	}

	if (palettes.length === 0) {
		throw new Error("No valid palettes found in file");
	}

	//console.log("Loaded palettes:", palettes);
	return palettes;
}

function detectTilePalette(tileData, referencePalettes) {
	const tileColors = new Set();

	// Extrai cores únicas do tile (ignorando transparência)
	for (let i = 0; i < tileData.data.length; i += 4) {
		const r = tileData.data[i];
		const g = tileData.data[i + 1];
		const b = tileData.data[i + 2];
		const a = tileData.data[i + 3];

		if (a > 0) { // Ignora pixels totalmente transparentes
			const color = (r << 16) | (g << 8) | b;
			tileColors.add(color);
		}
	}

	// Procura a paleta que contém todas as cores do tile
	for (let p = 0; p < referencePalettes.length; p++) {
		const paletteSet = new Set(referencePalettes[p]);
		let allColorsMatch = true;

		for (const color of tileColors) {
			if (!paletteSet.has(color)) {
				allColorsMatch = false;
				break;
			}
		}

		if (allColorsMatch) {
			return p; // Retorna o índice da paleta encontrada
		}
	}

	return 0; // Retorna a paleta padrão se nenhuma correspondência for encontrada
}


self.onmessage = function (event) {
	const data = event.data;
	if (data.action == "extract")
		extract(data.imageData, data.tileWidth, data.tileHeight, data.paletteIndex, data.paletteSize, data.totalColors, data.tolerance, data.paletteText);
};

function sendStart() {
	self.postMessage({ action: "extract-start" });
}

function sendProgress(progress) {
	self.postMessage({
		action: "extract-progress",
		progress: progress
	});
}

function sendResult(tiles, map, flipFlags, palettes, startTime) {
	self.postMessage({
		action: "extract-result",
		tiles: tiles,
		map: map,
		flipFlags: flipFlags,
		palettes: palettes,
		time: new Date().getTime() - startTime
	});
}
// Constantes para flags de flip (valores compatíveis com Tiled)
const FLIP_NONE = 0;
const FLIP_HORIZONTAL = 0x80000000;
const FLIP_VERTICAL = 0x40000000;
const FLIP_BOTH = FLIP_HORIZONTAL + FLIP_VERTICAL;


function extract(imageData, tileWidth, tileHeight, paletteIndex, paletteSize, totalColors, tolerance, paletteText) {
	sendStart();
	var startTime = new Date().getTime();


	var sourceWidth = imageData.width;
	var sourceHeight = imageData.height;
	var sourceArray = imageData.data;


	function createTileFrom() {
		var tileData = new ImageData(tileWidth, tileHeight);
		var deltaX = tileX * tileWidth;
		var deltaY = tileY * tileHeight;
		var tileArray = tileData.data;
		var tileIndex = 0;


		for (var y = 0; y < tileHeight; ++y) {
			for (var x = 0; x < tileWidth; ++x) {
				var sourceIndex = ((deltaY + y) * sourceWidth + (deltaX + x)) << 2;

				for (var i = 0; i < 4; ++i)
					tileArray[tileIndex++] = sourceArray[sourceIndex++];
			}
		}
		return tileData;
	}

	function compareTileWith(tileX, tileY, tile, flipFlags = FLIP_NONE) {
		var deltaX = tileX * tileWidth;
		var deltaY = tileY * tileHeight;

		var targetIndex = 0;
		var difference = 0;

		// Coordenadas de origem baseadas no tipo de flip
		var srcX, srcY;

		for (var y = 0; y < tileHeight; ++y) {
			for (var x = 0; x < tileWidth; ++x) {
				// Calcula coordenadas de origem com base no flip
				if (flipFlags & FLIP_HORIZONTAL) srcX = tileWidth - 1 - x;
				else srcX = x;

				if (flipFlags & FLIP_VERTICAL) srcY = tileHeight - 1 - y;
				else srcY = y;

				var sourceIndex = ((deltaY + srcY) * sourceWidth + (deltaX + srcX)) << 2;

				for (var i = 0; i < 4; ++i) {
					difference += Math.abs(tile[targetIndex++] - sourceArray[sourceIndex++]);
				}

				if (tolerance < difference)
					return false;
			}
		}
		return true;
	}

	var numCols = (sourceWidth / tileWidth) | 0;
	var numRows = (sourceHeight / tileHeight) | 0;
	var numTiles = numCols * numRows;
	var tiles = [];
	var map = [];
	var index;
	var flipFlags = []; // Novo array para armazenar as flags de flip
	var palettes = [];

	const tilePalettes = []; // Array separado para armazenar as paletas dos tiles

	if (paletteText) {
		try {
			palettes = loadPalettesFromText(paletteText);
			console.log("Successfully loaded", palettes.length, "palettes");
		} catch (e) {
			console.error("Failed to parse palettes:", e.message);
			// Mostra as primeiras linhas para debug
			const sampleLines = paletteText.split('\n').slice(0, 5).join('\n');
			console.error("File sample (first 5 lines):\n", sampleLines);
			palettes = null; // Garante que palettes será null em caso de erro
		}
	}

	for (var tileIndex = 0; tileIndex < numTiles; ++tileIndex) {
		var tileX = (tileIndex % numCols) | 0;
		var tileY = (tileIndex / numCols) | 0;

		var tileExist = false;
		var matchedFlip = FLIP_NONE;

		for (index = 0; index < tiles.length; ++index) {
			if (compareTileWith(tileX, tileY, tiles[index].data)) {
				tileExist = true;
				matchedFlip = FLIP_NONE;
				break;
			}
		}

		// Se não encontrou, verifica versões com flip
		if (!tileExist) {
			for (index = 0; index < tiles.length; ++index) {

				// Verifica flip horizontal
				if (compareTileWith(tileX, tileY, tiles[index].data, FLIP_HORIZONTAL)) {
					tileExist = true;
					matchedFlip = FLIP_HORIZONTAL;
					break;
				}
				// Verifica flip vertical
				if (compareTileWith(tileX, tileY, tiles[index].data, FLIP_VERTICAL)) {
					tileExist = true;
					matchedFlip = FLIP_VERTICAL;
					break;
				}
				// Verifica flip ambos
				if (compareTileWith(tileX, tileY, tiles[index].data, FLIP_BOTH)) {
					tileExist = true;
					matchedFlip = FLIP_BOTH;
					break;
				}

			}
		}

		if (!tileExist) {
			const newTile = createTileFrom(tileX, tileY);
			tiles.push(newTile);
			index = tiles.length - 1;
			// Detecta a paleta para o novo tile
			if (palettes) {
				tilePalettes[index] = paletteIndex + detectTilePalette(newTile, palettes);
				console.log(tilePalettes[index]);
			} else {
				tilePalettes[index] = 0; // Paleta padrão
			}
		}

		map.push(index);
		// Armazena as flags de flip separadamente
		flipFlags.push(matchedFlip);

		if (tileIndex % 32 == 0) {
			sendProgress(tileIndex / numTiles);
		}
	}
	sendResult(tiles, map, flipFlags, tilePalettes, startTime);
}