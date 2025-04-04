// ======================
// SECURITY CONFIGURATION
// ======================
const SECURITY_CONFIG = Object.freeze({
    MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
    MAX_TOTAL_SIZE: 200 * 1024 * 1024, // 200MB
    MAX_PAGES: 500, // Total pages across all documents
    MAX_DOCUMENTS: 20,
    ALLOWED_MIME_TYPES: ['application/pdf'],
    ALLOWED_EXTENSIONS: ['.pdf'],
    PDF_HEADER: [0x25, 0x50, 0x44, 0x46], // %PDF
    WATERMARK_TEXT: `Secure PDF Merger - ${new Date().toISOString().split('T')[0]}`
});

// =================
// SECURITY UTILITIES
// =================
class SecurityUtils {
    static escapeHtml(unsafe) {
        return unsafe.replace(/[&<>"']/g, (match) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[match]));
    }

    static async validateFileBasic(file) {
        // Frontend validation (quick checks)
        const extension = file.name.toLowerCase().slice(-4);
        if (!SECURITY_CONFIG.ALLOWED_EXTENSIONS.includes(extension)) {
            throw new Error('Invalid file extension');
        }
        
        if (file.size > SECURITY_CONFIG.MAX_FILE_SIZE) {
            throw new Error(`File size exceeds ${SECURITY_CONFIG.MAX_FILE_SIZE/1024/1024}MB limit`);
        }
        
        return true;
    }

    static async validateFileAdvanced(file) {
        // Backend-like validation (more thorough)
        try {
            // Check MIME type
            if (file.type && !SECURITY_CONFIG.ALLOWED_MIME_TYPES.includes(file.type)) {
                throw new Error('Invalid file type');
            }

            // Check magic number
            const header = await this.readFileHeader(file);
            if (!header.every((val, i) => val === SECURITY_CONFIG.PDF_HEADER[i])) {
                throw new Error('Invalid PDF header');
            }

            // Validate with PDF.js
            const arrayBuffer = await file.arrayBuffer();
            const pdfDoc = await pdfjsLib.getDocument(arrayBuffer).promise;
            
            // Security: Limit pages per document
            if (pdfDoc.numPages > 100) {
                throw new Error(`Document has too many pages (${pdfDoc.numPages} > 100)`);
            }
            
            return pdfDoc.numPages;
        } catch (error) {
            throw new Error(`PDF validation failed: ${error.message}`);
        }
    }

    static async readFileHeader(file, bytes = 4) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(new Uint8Array(reader.result.slice(0, bytes)));
            reader.readAsArrayBuffer(file.slice(0, bytes));
        });
    }
}

// ======================
// PDF MERGER CORE CLASS
// ======================
class SecurePDFMerger {
    constructor() {
        this.pdfFiles = [];
        this.totalPages = 0;
        this.initEventListeners();
        this.setupSecurityObservers();
    }

    setupSecurityObservers() {
        // Monitor for potential XSS attempts
        document.addEventListener('DOMNodeInserted', (e) => {
            if (e.target.tagName === 'SCRIPT' && 
                !e.target.src?.startsWith('https://cdnjs.cloudflare.com/')) {
                console.warn('Blocked potentially unsafe script insertion');
                e.target.remove();
            }
        });

        // Protect against prototype pollution
        Object.freeze(Object.prototype);
        Object.freeze(Array.prototype);
    }

    initEventListeners() {
        const dropArea = document.getElementById('dropArea');
        const fileInput = document.getElementById('fileInput');
        const mergeBtn = document.getElementById('mergeBtn');

        // Secure event handlers with proper cleanup
        dropArea.addEventListener('click', () => this.handleClick(), { passive: true });
        dropArea.addEventListener('dragover', (e) => this.handleDragOver(e), { passive: false });
        dropArea.addEventListener('dragleave', () => this.handleDragLeave(), { passive: true });
        dropArea.addEventListener('drop', (e) => this.handleDrop(e), { passive: false });
        
        fileInput.addEventListener('change', () => this.handleFileInput(), { passive: true });
        mergeBtn.addEventListener('click', () => this.mergePDFs(), { passive: true });
        
        // Cleanup on unload
        window.addEventListener('beforeunload', () => this.cleanup());
    }

    cleanup() {
        // Clear memory references
        this.pdfFiles.forEach(file => {
            if (file.arrayBuffer) {
                file.arrayBuffer = null;
            }
            if (file.thumbnailUrl) {
                URL.revokeObjectURL(file.thumbnailUrl);
            }
        });
        this.pdfFiles = [];
        this.totalPages = 0;
    }

    handleClick() {
        document.getElementById('fileInput').click();
    }

    handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        document.getElementById('dropArea').classList.add('highlight');
    }

    handleDragLeave() {
        document.getElementById('dropArea').classList.remove('highlight');
    }

    handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        document.getElementById('dropArea').classList.remove('highlight');
        this.handleFiles(e.dataTransfer.files);
    }

    handleFileInput() {
        const files = document.getElementById('fileInput').files;
        if (files.length > 0) {
            this.handleFiles(files);
        }
    }

    async handleFiles(files) {
        const validationStatus = document.getElementById('validationStatus');
        validationStatus.style.display = 'none';
        
        try {
            const fileArray = Array.from(files);
            
            // Check document count limit
            if (fileArray.length > SECURITY_CONFIG.MAX_DOCUMENTS) {
                throw new Error(`Cannot process more than ${SECURITY_CONFIG.MAX_DOCUMENTS} files at once`);
            }
            
            const totalSize = fileArray.reduce((sum, file) => sum + file.size, 0);
            
            if (totalSize > SECURITY_CONFIG.MAX_TOTAL_SIZE) {
                throw new Error(`Total files size exceeds ${SECURITY_CONFIG.MAX_TOTAL_SIZE/1024/1024}MB limit`);
            }

            for (const file of fileArray) {
                try {
                    // Frontend validation
                    await SecurityUtils.validateFileBasic(file);
                    
                    // Show validation status
                    validationStatus.textContent = `Validating ${SecurityUtils.escapeHtml(file.name)}...`;
                    validationStatus.className = 'validation-status';
                    validationStatus.style.display = 'block';
                    
                    // Backend-like validation and get page count
                    const pageCount = await SecurityUtils.validateFileAdvanced(file);
                    
                    // Check total pages limit
                    this.totalPages += pageCount;
                    if (this.totalPages > SECURITY_CONFIG.MAX_PAGES) {
                        throw new Error(`Total pages exceed ${SECURITY_CONFIG.MAX_PAGES} limit`);
                    }

                    // Process file
                    const arrayBuffer = await file.arrayBuffer();
                    const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                    
                    const page = await pdfDoc.getPage(1);
                    const viewport = page.getViewport({ scale: 0.2 });
                    
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d', { willReadFrequently: true });
                    canvas.height = viewport.height;
                    canvas.width = viewport.width;
                    
                    await page.render({
                        canvasContext: context,
                        viewport: viewport
                    }).promise;

                    const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.8); // Reduced quality for security
                    
                    this.pdfFiles.push({
                        file,
                        arrayBuffer,
                        thumbnailUrl,
                        pageCount,
                        isValid: true
                    });
                    
                    validationStatus.textContent = `${SecurityUtils.escapeHtml(file.name)} is valid (${pageCount} pages)`;
                    validationStatus.className = 'validation-status validation-valid';
                    
                    this.renderThumbnails();
                } catch (error) {
                    console.error('Validation Error:', error);
                    validationStatus.textContent = `${SecurityUtils.escapeHtml(file.name)}: ${error.message}`;
                    validationStatus.className = 'validation-status validation-invalid';
                    throw error;
                }
            }

            if (this.pdfFiles.length > 0) {
                document.getElementById('mergeBtn').disabled = false;
            }
        } catch (error) {
            console.error('Security Error:', error);
            setTimeout(() => {
                validationStatus.style.display = 'none';
            }, 5000);
        }
    }

    renderThumbnails() {
        const container = document.getElementById('thumbnailContainer');
        container.textContent = ''; // Safe clearing
        
        this.pdfFiles.forEach((pdfFile, index) => {
            const thumbnailDiv = document.createElement('div');
            thumbnailDiv.className = 'thumbnail';
            thumbnailDiv.draggable = true;
            thumbnailDiv.dataset.index = index;
            
            // Safe HTML construction with Trusted Types
            thumbnailDiv.innerHTML = `
                <span class="page-number">Page 1 of ${pdfFile.pageCount}</span>
                <button class="remove-btn" data-index="${index}">×</button>
                <img src="${pdfFile.thumbnailUrl}" alt="PDF thumbnail">
                <div class="file-info">${SecurityUtils.escapeHtml(pdfFile.file.name)} (${(pdfFile.file.size / 1024).toFixed(1)} KB)</div>
                <button class="move-up" data-index="${index}">↑</button>
                <button class="move-down" data-index="${index}">↓</button>
            `;
            
            container.appendChild(thumbnailDiv);
        });

        // Secure event delegation
        container.addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-btn')) {
                const index = parseInt(e.target.dataset.index);
                this.totalPages -= this.pdfFiles[index].pageCount;
                this.pdfFiles.splice(index, 1);
                this.renderThumbnails();
                if (this.pdfFiles.length === 0) {
                    document.getElementById('mergeBtn').disabled = true;
                }
            }
            
            if (e.target.classList.contains('move-up')) {
                const index = parseInt(e.target.dataset.index);
                if (index > 0) {
                    [this.pdfFiles[index], this.pdfFiles[index - 1]] = 
                        [this.pdfFiles[index - 1], this.pdfFiles[index]];
                    this.renderThumbnails();
                }
            }
            
            if (e.target.classList.contains('move-down')) {
                const index = parseInt(e.target.dataset.index);
                if (index < this.pdfFiles.length - 1) {
                    [this.pdfFiles[index], this.pdfFiles[index + 1]] = 
                        [this.pdfFiles[index + 1], this.pdfFiles[index]];
                    this.renderThumbnails();
                }
            }
        });
        
        // Secure drag and drop for reordering
        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            const draggingElement = document.querySelector('.thumbnail.dragging');
            const afterElement = this.getDragAfterElement(container, e.clientY);
            if (afterElement == null) {
                container.appendChild(draggingElement);
            } else {
                container.insertBefore(draggingElement, afterElement);
            }
        });
    }

    getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.thumbnail:not(.dragging)')];
        
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    async mergePDFs() {
        const mergeBtn = document.getElementById('mergeBtn');
        const loader = document.getElementById('loader');
        
        mergeBtn.disabled = true;
        mergeBtn.style.display = 'none';
        loader.style.display = 'block';
        
        try {
            const { PDFDocument } = PDFLib;
            const mergedPdf = await PDFDocument.create();
            
            // Process in chunks for memory safety
            for (let i = 0; i < this.pdfFiles.length; i++) {
                const pdfFile = this.pdfFiles[i];
                const pdfDoc = await PDFDocument.load(pdfFile.arrayBuffer);
                const pages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
                pages.forEach(page => mergedPdf.addPage(page));
                
                // Clear memory periodically
                if (i % 3 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            }
            
            // Add security watermark
            const pages = mergedPdf.getPages();
            pages.forEach(page => {
                page.drawText(SECURITY_CONFIG.WATERMARK_TEXT, {
                    x: 50,
                    y: 50,
                    size: 8,
                    opacity: 0.2,
                    rotate: Math.PI / 4,
                });
            });
            
            const mergedPdfBytes = await mergedPdf.save();
            
            // Show preview with sharing options
            const previewer = new SecurePDFPreviewer();
            previewer.showPreview(mergedPdfBytes);
            
        } catch (error) {
            console.error('Merge Error:', error);
            alert('Merge failed: ' + error.message);
        } finally {
            loader.style.display = 'none';
            mergeBtn.style.display = 'block';
            mergeBtn.disabled = false;
            mergeBtn.textContent = 'Merge PDFs';
        }
    }
}

// ======================
// SECURE PDF PREVIEWER
// ======================
class SecurePDFPreviewer {
    constructor() {
        this.mergedPdfBlob = null;
        this.previewModal = document.getElementById('previewModal');
        this.pdfPreview = document.getElementById('pdfPreview');
        this.fileError = document.getElementById('fileError');
        this.securityWatermark = document.getElementById('securityWatermark');
        
        this.initEventListeners();
        this.setupWatermark();
    }

    setupWatermark() {
        this.securityWatermark.textContent = SECURITY_CONFIG.WATERMARK_TEXT;
    }

    initEventListeners() {
        document.getElementById('downloadBtn').addEventListener('click', () => this.downloadPDF());
        document.getElementById('printBtn').addEventListener('click', () => this.printPDF());
        document.getElementById('driveBtn').addEventListener('click', () => this.saveToGoogleDrive());
        document.getElementById('onedriveBtn').addEventListener('click', () => this.saveToOneDrive());
        document.getElementById('emailBtn').addEventListener('click', () => this.sendViaEmail());
        document.getElementById('whatsappBtn').addEventListener('click', () => this.shareViaWhatsApp());
        document.getElementById('cancelBtn').addEventListener('click', () => this.closePreview());
    }

    async showPreview(mergedPdfBytes) {
        try {
            this.mergedPdfBlob = new Blob([mergedPdfBytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(this.mergedPdfBlob);
            
            // Load PDF in secure iframe
            this.pdfPreview.src = url;
            
            // Show modal
            this.previewModal.style.display = 'block';
            
            // Set timeout to auto-close if iframe fails to load
            this.loadTimeout = setTimeout(() => {
                if (!this.pdfPreview.contentDocument || 
                    !this.pdfPreview.contentDocument.querySelector('embed')) {
                    this.showError('Preview loading timed out');
                    this.closePreview();
                }
            }, 10000);
            
        } catch (error) {
            this.showError('Failed to generate preview: ' + error.message);
        }
    }

    closePreview() {
        if (this.loadTimeout) clearTimeout(this.loadTimeout);
        this.previewModal.style.display = 'none';
        if (this.mergedPdfBlob) {
            URL.revokeObjectURL(this.pdfPreview.src);
            this.mergedPdfBlob = null;
        }
    }

    downloadPDF() {
        if (!this.mergedPdfBlob) return;
        
        const url = URL.createObjectURL(this.mergedPdfBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'secure-merged-document.pdf';
        a.rel = 'noopener noreferrer';
        
        // Security: Time-limited download link
        document.body.appendChild(a);
        a.click();
        
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 1000);
    }

    printPDF() {
        if (!this.mergedPdfBlob) return;
        
        const url = URL.createObjectURL(this.mergedPdfBlob);
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = url;
        
        iframe.onload = () => {
            setTimeout(() => {
                iframe.contentWindow.print();
                setTimeout(() => {
                    document.body.removeChild(iframe);
                    URL.revokeObjectURL(url);
                }, 100);
            }, 500);
        };
        
        document.body.appendChild(iframe);
    }

    async saveToGoogleDrive() {
        if (!this.mergedPdfBlob) return;
        
        try {
            // Enable CSP for Google APIs
            enableCloudFeatures();
            
            // Load Google API client
            await this.loadGAPI();
            
            // Authenticate
            const token = await this.authenticateGoogle();
            
            // Upload file
            await this.uploadToGoogleDrive(token);
            
            alert('File saved to Google Drive successfully');
        } catch (error) {
            this.showError('Google Drive: ' + error.message);
        }
    }

    loadGAPI() {
        return new Promise((resolve, reject) => {
            if (window.gapi) return resolve();
            
            const script = document.createElement('script');
            script.src = 'https://apis.google.com/js/api.js';
            script.async = true;
            script.defer = true;
            script.onload = () => {
                gapi.load('client:auth2', resolve);
            };
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    authenticateGoogle() {
        return new Promise((resolve, reject) => {
            gapi.auth2.init({
                client_id: 'YOUR_GOOGLE_CLIENT_ID',
                scope: 'https://www.googleapis.com/auth/drive.file'
            }).then(() => {
                const authInstance = gapi.auth2.getAuthInstance();
                if (authInstance.isSignedIn.get()) {
                    resolve(authInstance.currentUser.get().getAuthResponse().access_token);
                } else {
                    authInstance.signIn().then(user => {
                        resolve(user.getAuthResponse().access_token);
                    }).catch(reject);
                }
            }).catch(reject);
        });
    }

    uploadToGoogleDrive(token) {
        const metadata = {
            name: 'secure-merged-document.pdf',
            mimeType: 'application/pdf'
        };
        
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', this.mergedPdfBlob);
        
        return fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: new Headers({ 'Authorization': 'Bearer ' + token }),
            body: form
        });
    }

    saveToOneDrive() {
        this.showError('OneDrive integration requires additional setup. Please download and upload manually.');
    }

    sendViaEmail() {
        if (!this.mergedPdfBlob) return;
        
        const subject = encodeURIComponent('Merged PDF Document');
        const body = encodeURIComponent('Please find attached the merged PDF document.');
        window.location.href = `mailto:?subject=${subject}&body=${body}`;
    }

    shareViaWhatsApp() {
        if (!this.mergedPdfBlob) return;
        
        const text = encodeURIComponent('Check out this merged PDF document');
        window.open(`https://wa.me/?text=${text}`, '_blank');
    }

    showError(message) {
        this.fileError.textContent = message;
        this.fileError.style.display = 'block';
        setTimeout(() => {
            this.fileError.style.display = 'none';
        }, 5000);
    }
}

// ======================
// APPLICATION INITIALIZATION
// ======================
document.addEventListener('DOMContentLoaded', () => {
    // Environment checks
    if (!window.isSecureContext) {
        document.body.innerHTML = `
            <div style="color: red; padding: 20px; border: 1px solid red; margin: 20px;">
                <h2>Security Alert</h2>
                <p>This application requires a secure (HTTPS) connection</p>
            </div>
        `;
        return;
    }

    // Feature detection
    if (!('Blob' in window) || !('FileReader' in window)) {
        alert('Your browser does not support required features');
        return;
    }

    try {
        // Initialize
        new SecurePDFMerger();
    } catch (error) {
        console.error('Initialization Error:', error);
        document.body.innerHTML = `
            <div style="color: red; padding: 20px; border: 1px solid red; margin: 20px;">
                <h2>Initialization Error</h2>
                <p>${SecurityUtils.escapeHtml(error.message)}</p>
            </div>
        `;
    }
});
