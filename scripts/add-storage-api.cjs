const fs = require('fs');
const path = require('path');

const webServerPath = path.join(process.cwd(), 'src', 'web-server.ts');
let code = fs.readFileSync(webServerPath, 'utf8');

const storageApiCode = `
// ============================================
// STORAGE MANAGEMENT API
// ============================================
app.get('/api/storage/stats', adminOrApiKeyMiddleware, (req, res) => {
    try {
        const mediaDir = path.join(process.cwd(), 'src', 'data', 'media');
        let totalSize = 0;
        let fileCount = 0;
        let oldestFileDate = new Date();
        let newestFileDate = new Date(0);
        
        if (fs.existsSync(mediaDir)) {
            const files = fs.readdirSync(mediaDir);
            for (const file of files) {
                // Ignore .gitignore
                if (file === '.gitignore') continue;
                
                const filePath = path.join(mediaDir, file);
                const stats = fs.statSync(filePath);
                if (stats.isFile()) {
                    totalSize += stats.size;
                    fileCount++;
                    if (stats.mtime < oldestFileDate) oldestFileDate = stats.mtime;
                    if (stats.mtime > newestFileDate) newestFileDate = stats.mtime;
                }
            }
        }
        
        res.json({
            success: true,
            data: {
                totalSize,
                fileCount,
                oldestFileDate: fileCount > 0 ? oldestFileDate : null,
                newestFileDate: fileCount > 0 ? newestFileDate : null
            }
        });
    } catch (error: any) {
        console.error('Error fetching storage stats:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/storage/media', adminOrApiKeyMiddleware, (req, res) => {
    try {
        const olderThanDays = parseInt(req.body.olderThanDays as string || '0', 10);
        const mediaDir = path.join(process.cwd(), 'src', 'data', 'media');
        let deletedCount = 0;
        let deletedSize = 0;
        
        if (!fs.existsSync(mediaDir)) {
            return res.json({ success: true, deletedCount, deletedSize, message: 'Folder media kosong.' });
        }
        
        const files = fs.readdirSync(mediaDir);
        const cutoffTime = new Date().getTime() - (olderThanDays * 24 * 60 * 60 * 1000);
        
        for (const file of files) {
            if (file === '.gitignore') continue;
            
            const filePath = path.join(mediaDir, file);
            const stats = fs.statSync(filePath);
            
            if (stats.isFile() && stats.mtime.getTime() <= cutoffTime) {
                fs.unlinkSync(filePath);
                deletedCount++;
                deletedSize += stats.size;
            }
        }
        
        res.json({
            success: true,
            deletedCount,
            deletedSize,
            message: \`Berhasil menghapus \${deletedCount} file media.\`
        });
    } catch (error: any) {
        console.error('Error deleting media files:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
`;

if (!code.includes('/api/storage/stats')) {
    code = code.replace(
        "// Clear old logs (admin only)",
        storageApiCode + "\n// Clear old logs (admin only)"
    );
    fs.writeFileSync(webServerPath, code);
    console.log("Storage API added to web-server.ts");
} else {
    console.log("Storage API already exists");
}
