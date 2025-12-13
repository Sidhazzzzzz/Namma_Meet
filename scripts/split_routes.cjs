const fs = require('fs');
const path = require('path');

const inputFile = path.join(__dirname, '../public/data/bmtc_routes.json');
const outputDir = path.join(__dirname, '../public/data');

// Read the large file
console.log('Reading file...');
const rawData = fs.readFileSync(inputFile);
const data = JSON.parse(rawData);

if (!data.features || !Array.isArray(data.features)) {
    console.error('Invalid GeoJSON format: features array missing');
    process.exit(1);
}

const totalFeatures = data.features.length;
console.log(`Total features: ${totalFeatures}`);

// Split into 3 parts (approx 15MB each)
const chunks = 3;
const chunkSize = Math.ceil(totalFeatures / chunks);

for (let i = 0; i < chunks; i++) {
    const start = i * chunkSize;
    const end = start + chunkSize;
    const chunkFeatures = data.features.slice(start, end);

    const chunkData = {
        type: "FeatureCollection",
        features: chunkFeatures
    };

    const outputPath = path.join(outputDir, `bmtc_routes_part${i + 1}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(chunkData));
    console.log(`Written ${outputPath} (${chunkFeatures.length} features)`);
}

console.log('Done splitting.');
