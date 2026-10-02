const fs = require('fs');
const path = require('path');

const mediaDir = path.join(process.cwd(), 'src', 'data', 'media');
const folders = fs.readdirSync(mediaDir);
const gallery = [];

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
            url: `/media/${folder}/${f}`,
            size: stats.size,
            date: stats.mtime
        };
    }).sort((a, b) => b.date.getTime() - a.date.getTime());

    if (mediaFiles.length > 0) {
        gallery.push({
            session: folder,
            count: mediaFiles.length,
            totalSize: mediaFiles.reduce((acc, curr) => acc + curr.size, 0),
            files: mediaFiles
        });
    }
}

gallery.sort((a, b) => b.files[0].date.getTime() - a.files[0].date.getTime());

console.log(JSON.stringify(gallery, null, 2));
