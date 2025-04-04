// Security Configuration
const SECURITY_CONFIG = {
    MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
    MAX_TOTAL_SIZE: 200 * 1024 * 1024, // 200MB
    MAX_PAGES: 500,
    ALLOWED_MIME_TYPES: ['application/pdf'],
    ALLOWED_EXTENSIONS: ['.pdf'],
    PDF_HEADER: [0x25, 0x50, 0x44, 0x46] // %PDF
};

class SecurePDFMerger {
    constructor() {
        this.pdfFiles = [];
        this.totalPages = 0;
        this.initEventListeners();
    }

    initEventListeners() {
        const dropArea = document.getElementById('dropArea');
        const fileInput = document.getElementById('fileInput');
        const mergeBtn = document.getElementById('mergeBtn');
        const previewModal = document.getElementById('previewModal');

        dropArea.addEventListener('click', () => fileInput.click());
        dropArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropArea.classList.add('highlight');
        });
        dropArea.addEventListener('dragleave', () => {
            dropArea.classList.remove('highlight');
        });
        dropArea.addEventListener('drop', (e) => {
            e.preventDefault();
            dropArea.classList.remove('highlight');
            this.handleFiles(e.dataTransfer.files);
        });

        fileInput.addEventListener('change', () => {
            if (fileInput.files.length > 0) {
                this.handleFiles(fileInput.files);
            }
        });

        mergeBtn.addEventListener('click', () => this.mergePDFs());

        // Preview modal buttons
        document.getElementById('downloadBtn').addEventListener('click', () => this.downloadPDF());
        document.getElementById('printBtn').addEventListener('click', () => this.printPDF());
        document.getElementById('cancelBtn').addEventListener('click', () => this.closePreview());
    }

    async handleFiles(files) {
        const fileArray = Array.from(files);
        
        // Check total files count
        if (fileArray.length > 20) {
            alert('Maximum 20 files allowed at once');
            return;
        }

        // Check total size
        const totalSize = fileArray.reduce((sum, file) => sum + file.size, 0);
        if (totalSize > SECURITY_CONFIG.MAX_TOTAL_SIZE) {
            alert(`Total size exceeds ${SECURITY_CONFIG.MAX_TOTAL_SIZE/1024/1024}MB limit`);
            return;
        }

        for (const file of fileArray) {
            try {
                // Basic validation
                if (!file.name.toLowerCase().endsWith('.pdf')) {
                    throw new Error('Invalid file extension');
                }

                if (file.size > SECURITY_CONFIG.MAX_FILE_SIZE) {
                    throw new Error(`File exceeds ${SECURITY_CONFIG.MAX_FILE_SIZE/1024/1024}MB limit`);
                }

                // Advanced validation
                const arrayBuffer = await file.arrayBuffer();
                
                // Check PDF header
                const header = new Uint8Array(arrayBuffer.slice(0, 4));
                if (!header.every((val, i) => val === SECURITY_CONFIG.PDF_HEADER[i])) {
                    throw new Error('Invalid PDF header');
                }

                // Validate with PDF.js
                const pdfDoc = await pdfjsLib.getDocument({ 
                    data: arrayBuffer,
                    disableFontFace: true,
                    disableRange: true
                }).promise;

                if (pdfDoc.numPages > 100) {
                    throw new Error('Document has too many pages (>100)');
                }

                // Create thumbnail
                const page = await pdfDoc.getPage(1);
                const viewport = page.getViewport({ scale: 0.2 });
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;
                
                await page.render({
                    canvasContext: context,
                    viewport: viewport
                }).promise;

                this.pdfFiles.push({
                    file,
                    arrayBuffer,
                    thumbnailUrl: canvas.toDataURL(),
                    pageCount: pdfDoc.numPages
                });

                this.totalPages += pdfDoc.numPages;
                this.renderThumbnails();
                document.getElementById('mergeBtn').disabled = false;

            } catch (error) {
                console.error(`Error processing ${file.name}:`, error);
                alert(`${file.name}: ${error.message}`);
            }
        }
    }

    renderThumbnails() {
        const container = document.getElementById('thumbnailContainer');
        container.innerHTML = '';

        this.pdfFiles.forEach((pdfFile, index) => {
            const thumbnailDiv = document.createElement('div');
            thumbnailDiv.className = 'thumbnail';
            thumbnailDiv.innerHTML = `
                <span class="page-number">Page 1 of ${pdfFile.pageCount}</span>
                <button class="remove-btn" data-index="${index}">×</button>
                <img src="${pdfFile.thumbnailUrl}" alt="Preview">
                <div class="file-info">${pdfFile.file.name} (${(pdfFile.file.size/1024).toFixed(1)}KB)</div>
            `;
            container.appendChild(thumbnailDiv);

            // Add remove button event
            thumbnailDiv.querySelector('.remove-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this.pdfFiles.splice(index, 1);
                this.renderThumbnails();
                if (this.pdfFiles.length === 0) {
                    document.getElementById('mergeBtn').disabled = true;
                }
            });
        });
    }

    async mergePDFs() {
        const mergeBtn = document.getElementById('mergeBtn');
        mergeBtn.disabled = true;
        mergeBtn.textContent = 'Merging...';

        try {
            const { PDFDocument } = PDFLib;
            const mergedPdf = await PDFDocument.create();

            for (const pdfFile of this.pdfFiles) {
                const pdfDoc = await PDFDocument.load(pdfFile.arrayBuffer);
                const pages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
                pages.forEach(page => mergedPdf.addPage(page));
            }

            const mergedPdfBytes = await mergedPdf.save();
            this.showPreview(mergedPdfBytes);

        } catch (error) {
            console.error('Merge failed:', error);
            alert('Merge failed: ' + error.message);
        } finally {
            mergeBtn.disabled = false;
            mergeBtn.textContent = 'Merge PDFs';
        }
    }

    showPreview(pdfBytes) {
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        document.getElementById('pdfPreview').src = url;
        document.getElementById('previewModal').style.display = 'block';
        this.currentPdfUrl = url;
    }

    downloadPDF() {
        const a = document.createElement('a');
        a.href = this.currentPdfUrl;
        a.download = 'merged-document.pdf';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    printPDF() {
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = this.currentPdfUrl;
        document.body.appendChild(iframe);
        iframe.onload = () => {
            iframe.contentWindow.print();
            setTimeout(() => {
                document.body.removeChild(iframe);
            }, 1000);
        };
    }

    closePreview() {
        URL.revokeObjectURL(this.currentPdfUrl);
        document.getElementById('previewModal').style.display = 'none';
    }
}

// Initialize when PDF.js is ready
document.addEventListener('DOMContentLoaded', () => {
    const checkReady = setInterval(() => {
        if (typeof pdfjsLib !== 'undefined' && pdfjsLib.GlobalWorkerOptions.workerSrc) {
            clearInterval(checkReady);
            new SecurePDFMerger();
        }
    }, 100);
});
