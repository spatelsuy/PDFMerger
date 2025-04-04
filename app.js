// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.12.313/pdf.worker.min.js';

const dropArea = document.getElementById('dropArea');
const fileInput = document.getElementById('fileInput');
const thumbnailContainer = document.getElementById('thumbnailContainer');
const mergeBtn = document.getElementById('mergeBtn');

let pdfFiles = [];

// Set up drag and drop
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
    handleFiles(e.dataTransfer.files);
});

fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
        handleFiles(fileInput.files);
    }
});

mergeBtn.addEventListener('click', mergePDFs);

async function handleFiles(files) {
    const pdfFilesArray = Array.from(files).filter(file => file.type === 'application/pdf');
    
    if (pdfFilesArray.length === 0) {
        alert('Please select PDF files only.');
        return;
    }
    
    for (const file of pdfFilesArray) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdfDoc = await pdfjsLib.getDocument(arrayBuffer).promise;
            
            // Get first page for thumbnail
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
            
            const thumbnailUrl = canvas.toDataURL();
            const pageCount = pdfDoc.numPages;
            
            pdfFiles.push({
                file,
                arrayBuffer,
                thumbnailUrl,
                pageCount
            });
            
            renderThumbnails();
        } catch (error) {
            console.error('Error processing PDF:', error);
            alert(`Error processing ${file.name}: ${error.message}`);
        }
    }
    
    if (pdfFiles.length > 0) {
        mergeBtn.disabled = false;
    }
}

function renderThumbnails() {
    thumbnailContainer.innerHTML = '';
    
    pdfFiles.forEach((pdfFile, index) => {
        const thumbnailDiv = document.createElement('div');
        thumbnailDiv.className = 'thumbnail';
        thumbnailDiv.draggable = true;
        thumbnailDiv.dataset.index = index;
        
        thumbnailDiv.innerHTML = `
            <span class="page-number">Page 1 of ${pdfFile.pageCount}</span>
            <button class="remove-btn" data-index="${index}">×</button>
            <img src="${pdfFile.thumbnailUrl}" alt="${pdfFile.file.name}">
            <div class="file-info">${pdfFile.file.name} (${(pdfFile.file.size / 1024).toFixed(1)} KB)</div>
            <button class="move-up" data-index="${index}">↑</button>
            <button class="move-down" data-index="${index}">↓</button>
        `;
        
        thumbnailContainer.appendChild(thumbnailDiv);
        
        // Set up drag and drop for reordering
        thumbnailDiv.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', index);
            setTimeout(() => thumbnailDiv.classList.add('dragging'), 0);
        });
        
        thumbnailDiv.addEventListener('dragend', () => {
            thumbnailDiv.classList.remove('dragging');
        });
    });
    
    // Set up drop targets for reordering
    thumbnailContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
        const draggingElement = document.querySelector('.thumbnail.dragging');
        const afterElement = getDragAfterElement(thumbnailContainer, e.clientY);
        if (afterElement == null) {
            thumbnailContainer.appendChild(draggingElement);
        } else {
            thumbnailContainer.insertBefore(draggingElement, afterElement);
        }
    });
    
    // Set up remove buttons
    document.querySelectorAll('.remove-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const index = parseInt(btn.dataset.index);
            pdfFiles.splice(index, 1);
            renderThumbnails();
            if (pdfFiles.length === 0) {
                mergeBtn.disabled = true;
            }
        });
    });
    
    // Set up move up buttons
    document.querySelectorAll('.move-up').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const index = parseInt(btn.dataset.index);
            if (index > 0) {
                [pdfFiles[index], pdfFiles[index - 1]] = [pdfFiles[index - 1], pdfFiles[index]];
                renderThumbnails();
            }
        });
    });
    
    // Set up move down buttons
    document.querySelectorAll('.move-down').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const index = parseInt(btn.dataset.index);
            if (index < pdfFiles.length - 1) {
                [pdfFiles[index], pdfFiles[index + 1]] = [pdfFiles[index + 1], pdfFiles[index]];
                renderThumbnails();
            }
        });
    });
}

function getDragAfterElement(container, y) {
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

async function mergePDFs() {
    if (pdfFiles.length === 0) return;
    
    mergeBtn.disabled = true;
    mergeBtn.textContent = 'Merging...';
    
    try {
        // Create a new PDF document
        const { PDFDocument } = PDFLib;
        const mergedPdf = await PDFDocument.create();
        
        // Copy pages from each PDF
        for (const pdfFile of pdfFiles) {
            const pdfDoc = await PDFDocument.load(pdfFile.arrayBuffer);
            const pages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
            pages.forEach(page => mergedPdf.addPage(page));
        }
        
        // Save the merged PDF
        const mergedPdfBytes = await mergedPdf.save();
        
        // Create download link
        const blob = new Blob([mergedPdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'merged.pdf';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
    } catch (error) {
        console.error('Error merging PDFs:', error);
        alert(`Error merging PDFs: ${error.message}`);
    } finally {
        mergeBtn.disabled = false;
        mergeBtn.textContent = 'Merge PDFs';
    }
}
