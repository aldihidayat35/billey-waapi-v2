const fs = require('fs');
const path = require('path');

const webServerPath = path.join(process.cwd(), 'src', 'web-server.ts');
let code = fs.readFileSync(webServerPath, 'utf8');

const galleryApiCode = `
app.get('/api/storage/gallery', adminOrApiKeyMiddleware, (req, res) => {
    try {
        const mediaDir = path.join(process.cwd(), 'src', 'data', 'media');
        
        if (!fs.existsSync(mediaDir)) {
            return res.json({ success: true, data: [] });
        }

        const folders = fs.readdirSync(mediaDir);
        const gallery: any[] = [];

        for (const folder of folders) {
            if (folder === '.gitignore') continue;
            
            const folderPath = path.join(mediaDir, folder);
            if (!fs.statSync(folderPath).isDirectory()) continue;
            
            const files = fs.readdirSync(folderPath);
            const mediaFiles = files.filter(f => f !== '.gitignore').map(f => {
                const filePath = path.join(folderPath, f);
                const stats = fs.statSync(filePath);
                return {
                    name: f,
                    url: \`/media/\${folder}/\${f}\`,
                    size: stats.size,
                    date: stats.mtime
                };
            }).sort((a, b) => b.date.getTime() - a.date.getTime());

            if (mediaFiles.length > 0) {
                gallery.push({
                    session: folder,
                    count: mediaFiles.length,
                    totalSize: mediaFiles.reduce((acc: number, curr: any) => acc + curr.size, 0),
                    files: mediaFiles
                });
            }
        }
        
        gallery.sort((a, b) => b.files[0].date.getTime() - a.files[0].date.getTime());

        res.json({ success: true, data: gallery });
    } catch (error: any) {
        console.error('Error fetching gallery:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});
`;

if (!code.includes('/api/storage/gallery')) {
    code = code.replace(
        "app.delete('/api/storage/media', adminOrApiKeyMiddleware,",
        galleryApiCode + "\napp.delete('/api/storage/media', adminOrApiKeyMiddleware,"
    );
    fs.writeFileSync(webServerPath, code);
    console.log("Gallery API added to web-server.ts");
} else {
    console.log("Gallery API already exists");
}
