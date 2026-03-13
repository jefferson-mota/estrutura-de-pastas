document.addEventListener('DOMContentLoaded', () => {
    // ==========================================
    // --- CONEXÃO COM O SUPABASE (NUVEM) ---
    // ==========================================
    const supabaseUrl = 'https://upsumsfadqvvkuffofdb.supabase.co';
    const supabaseKey = 'sb_publishable_F_93bb54saa5WBSOdz5jAg_3pGeHEu5';
    
    const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

    const editor = document.querySelector('.code-editor');
    const treeContainer = document.getElementById('tree-view');
    const closedFoldersState = new Set();
    let draggedBlocks = []; 
    const AUTOSAVE_KEY = 'treeSim_autosave_data';

    // ==========================================
    // --- NOTIFICAÇÃO FLUTUANTE (TOAST) ---
    // ==========================================
    function showToast(message) {
        let toast = document.getElementById('save-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'save-toast';
            toast.className = 'toast-notification';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.add('show');
        
        clearTimeout(toast.hideTimeout);
        toast.hideTimeout = setTimeout(() => {
            toast.classList.remove('show');
        }, 2500);
    }

    function showCustomConfirm(title, message, buttons) {
        return new Promise((resolve) => {
            const modal = document.getElementById('modal-confirm');
            const titleEl = document.getElementById('confirm-title');
            const msgEl = document.getElementById('confirm-message');
            const btnsContainer = document.getElementById('confirm-buttons');

            titleEl.textContent = title;
            msgEl.textContent = message;
            btnsContainer.innerHTML = ''; 

            buttons.forEach(btnData => {
                const btn = document.createElement('button');
                btn.className = `btn ${btnData.class}`;
                btn.innerHTML = btnData.label;
                btn.addEventListener('click', () => {
                    modal.classList.remove('show');
                    resolve(btnData.value); 
                });
                btnsContainer.appendChild(btn);
            });
            
            modal.classList.add('show');
            if (typeof lucide !== 'undefined') lucide.createIcons();
        });
    }

    // ==========================================
    // --- MÁQUINA DO TEMPO (DESFAZER/REFAZER) ---
    // ==========================================
    let historyStack = [];
    let historyIndex = -1;
    let isHistoryAction = false; 
    window.isRenamingActive = false; 

    const btnUndo = document.getElementById('btn-undo');
    const btnRedo = document.getElementById('btn-redo');
    const btnClear = document.getElementById('btn-clear');

    window.saveHistoryState = function() {
        if (typeof editor === 'undefined' || !editor) return;
        if (window.isRenamingActive) return; 
        if (document.querySelector('.inline-edit-input')) return;

        const currentVal = editor.value;
        if (historyStack.length === 0 || historyStack[historyIndex] !== currentVal) {
            if (historyIndex < historyStack.length - 1) {
                historyStack = historyStack.slice(0, historyIndex + 1);
            }
            historyStack.push(currentVal);
            historyIndex++;
        }
    };

    window.performUndo = function() {
        if (historyIndex > 0) {
            historyIndex--;
            while (historyIndex > 0 && historyStack[historyIndex].includes("Novo_Item")) {
                historyIndex--;
            }
            isHistoryAction = true; 
            editor.value = historyStack[historyIndex];
            updateTree();
            
            if (typeof setUnsavedState === 'function') setUnsavedState(true);
            if (typeof updateMenuStates === 'function') updateMenuStates();
            setTimeout(() => { isHistoryAction = false; }, 50); 
        }
    };

    window.performRedo = function() {
        if (historyIndex < historyStack.length - 1) {
            historyIndex++;
            while (historyIndex < historyStack.length - 1 && historyStack[historyIndex].includes("Novo_Item")) {
                historyIndex++;
            }
            isHistoryAction = true;
            editor.value = historyStack[historyIndex];
            updateTree();
            
            if (typeof setUnsavedState === 'function') setUnsavedState(true);
            if (typeof updateMenuStates === 'function') updateMenuStates();
            setTimeout(() => { isHistoryAction = false; }, 50);
        }
    };

    if (btnUndo) {
        btnUndo.addEventListener('click', (e) => {
            e.preventDefault();
            window.performUndo();
        });
    }

    if (btnRedo) {
        btnRedo.addEventListener('click', (e) => {
            e.preventDefault();
            window.performRedo();
        });
    }
    
    if (btnClear) {
        btnClear.addEventListener('click', async () => {
            if (editor.value.trim() !== '') {
                const res = await showCustomConfirm(
                    "Limpar Estrutura",
                    "Tem certeza que deseja apagar tudo? O painel ficará em branco.",
                    [
                        { label: "Cancelar", value: false, class: "btn-outline" },
                        { label: "<i data-lucide='trash-2' class='icon-sm'></i> Sim, apagar", value: true, class: "btn-danger" }
                    ]
                );
                if (res) {
                    editor.value = '';
                    localStorage.removeItem(AUTOSAVE_KEY); 
                    updateTree();
                    window.saveHistoryState(); 
                }
            }
        });
    }

    // ==========================================
    // --- EXPANDIR E RECOLHER TUDO ---
    // ==========================================
    const btnExpandAll = document.getElementById('btn-expand-all');
    const btnCollapseAll = document.getElementById('btn-collapse-all');

    if (btnExpandAll) {
        btnExpandAll.addEventListener('click', () => {
            closedFoldersState.clear();
            const folders = treeContainer.querySelectorAll('.tree-item.is-folder');
            folders.forEach(folder => {
                folder.classList.remove('closed');
                folder.classList.add('open');
                const icon = folder.querySelector(':scope > .tree-content .tree-icon');
                if (icon) {
                    icon.innerHTML = ''; 
                    icon.setAttribute('data-lucide', 'folder-open');
                }
            });
            if (typeof lucide !== 'undefined') lucide.createIcons();
        });
    }

    if (btnCollapseAll) {
        btnCollapseAll.addEventListener('click', () => {
            const folders = treeContainer.querySelectorAll('.tree-item.is-folder');
            folders.forEach(folder => {
                const path = folder.getAttribute('data-path');
                if (path) closedFoldersState.add(path);
                folder.classList.remove('open');
                folder.classList.add('closed');
                const icon = folder.querySelector(':scope > .tree-content .tree-icon');
                if (icon) {
                    icon.innerHTML = ''; 
                    icon.setAttribute('data-lucide', 'folder');
                }
            });
            if (typeof lucide !== 'undefined') lucide.createIcons();
        });
    }

    // ==========================================
    // --- MOTOR DE BUSCA (COM HIGHLIGHT) ---
    // ==========================================
    const searchInput = document.getElementById('search-input');
    let clearSearchBtn;

    function normalizeText(text) {
        return text.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase();
    }

    if (searchInput) {
        const searchWrapper = searchInput.parentElement;
        clearSearchBtn = searchWrapper.querySelector('.clear-search-btn');
        if (!clearSearchBtn) {
            clearSearchBtn = document.createElement('button');
            clearSearchBtn.className = 'clear-search-btn';
            clearSearchBtn.innerHTML = '<i data-lucide="x" style="width: 14px; height: 14px;"></i>';
            clearSearchBtn.title = 'Limpar pesquisa';
            searchWrapper.appendChild(clearSearchBtn);

            clearSearchBtn.addEventListener('click', () => {
                searchInput.value = '';
                applySearch(); 
                searchInput.focus();
            });
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
        searchInput.addEventListener('input', applySearch);
    }

    function applySearch() {
        if (!searchInput) return;
        const rawTerm = searchInput.value.trim();
        const term = normalizeText(rawTerm);
        const allItems = treeContainer.querySelectorAll('.tree-item');
        
        if (clearSearchBtn) clearSearchBtn.style.display = rawTerm === '' ? 'none' : 'flex';

        const oldMsg = treeContainer.querySelector('.search-results-msg');
        if (oldMsg) oldMsg.remove();

        allItems.forEach(item => {
            item.classList.add('hidden-by-search');
            const nameSpan = item.querySelector(':scope > .tree-content .tree-name');
            if (nameSpan && !nameSpan.querySelector('input')) {
                nameSpan.innerHTML = nameSpan.textContent; 
            }
        });

        if (term === '') {
            allItems.forEach(item => item.classList.remove('hidden-by-search'));
            return;
        }

        let foundCount = 0;

        allItems.forEach(item => {
            const nameSpan = item.querySelector(':scope > .tree-content .tree-name');
            if (nameSpan && !nameSpan.querySelector('input')) {
                const originalText = nameSpan.textContent;
                const itemName = normalizeText(originalText);
                const matchIndex = itemName.indexOf(term);

                if (matchIndex !== -1) {
                    foundCount++;
                    item.classList.remove('hidden-by-search');

                    const before = originalText.substring(0, matchIndex);
                    const matchText = originalText.substring(matchIndex, matchIndex + term.length);
                    const after = originalText.substring(matchIndex + term.length);
                    nameSpan.innerHTML = `${before}<mark class="search-highlight">${matchText}</mark>${after}`;

                    const descendants = item.querySelectorAll('.tree-item');
                    descendants.forEach(desc => desc.classList.remove('hidden-by-search'));

                    let parent = item.parentElement.closest('.tree-item');
                    while (parent) {
                        parent.classList.remove('hidden-by-search'); 
                        parent.classList.remove('closed');
                        parent.classList.add('open');
                        const icon = parent.querySelector(':scope > .tree-content .tree-icon');
                        if (icon) {
                            icon.innerHTML = '';
                            icon.setAttribute('data-lucide', 'folder-open');
                        }
                        const path = parent.getAttribute('data-path');
                        if (path) closedFoldersState.delete(path);
                        parent = parent.parentElement.closest('.tree-item');
                    }
                }
            }
        });

        if (allItems.length > 0) {
            const msgDiv = document.createElement('div');
            msgDiv.className = 'search-results-msg';
            if (foundCount === 0) {
                msgDiv.innerHTML = `Nenhum resultado encontrado para "<strong>${rawTerm}</strong>"`;
            } else {
                const plural = foundCount === 1 ? 'resultado encontrado' : 'resultados encontrados';
                msgDiv.innerHTML = `<strong>${foundCount}</strong> ${plural} para "<strong>${rawTerm}</strong>"`;
            }
            treeContainer.insertBefore(msgDiv, treeContainer.firstChild);
        }
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    // ==========================================
    // --- SINCRONIZAÇÃO DE SCROLL ---
    // ==========================================
    function syncVisualScroll() {
        const cursorPosition = editor.selectionStart;
        const currentLineIndex = editor.value.substring(0, cursorPosition).split('\n').length - 1;
        const targetLi = treeContainer.querySelector(`li[data-line="${currentLineIndex}"]`);
        if (targetLi) targetLi.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function syncTextScroll(lineIndex) {
        const computedStyle = window.getComputedStyle(editor);
        let lineHeight = parseFloat(computedStyle.lineHeight);
        if (isNaN(lineHeight)) lineHeight = (parseFloat(computedStyle.fontSize) || 16) * 1.5; 
        const scrollAmount = (lineIndex * lineHeight) - (editor.clientHeight / 2);
        editor.scrollTo({ top: Math.max(0, scrollAmount), behavior: 'smooth' });
    }

    // ==========================================
    // --- PARSER E RENDERIZAÇÃO DA ÁRVORE ---
    // ==========================================
    function updateTree() {
        const text = editor.value;
        const MAX_HISTORY = 50; 
        
        localStorage.setItem(AUTOSAVE_KEY, text);

        if (!isHistoryAction) {
            if (historyIndex < 0 || historyStack[historyIndex] !== text) {
                historyStack = historyStack.slice(0, historyIndex + 1);
                historyStack.push(text);
                if (historyStack.length > MAX_HISTORY) {
                    historyStack.shift(); 
                } else {
                    historyIndex++;
                }
            }
        }

        if (text.trim() === '') {
            treeContainer.innerHTML = `
                <div class="empty-state" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; width: 100%;">
                    <p style="margin-bottom: 1rem;">Sua estrutura está vazia.</p>
                    <button class="btn btn-primary add-root-btn" style="width: auto; padding: 8px 16px; border: none; box-shadow: none; position: static;">+ Criar Primeira Pasta</button>
                </div>
            `;
            applySearch(); 
            return;
        }
        
        const treeData = parseTextToTree(text);
        let html = renderTreeHTML(treeData);
        
        html += `<div class="tree-spacer" style="display: block; height: 60px; width: 100%;"></div>`;
        html += `<button class="add-root-btn">+ Adicionar item na raiz</button>`;
        treeContainer.innerHTML = html;

        applySearch();
        if (typeof lucide !== 'undefined') lucide.createIcons();
        if (typeof setUnsavedState === 'function') setUnsavedState(true); 
        if (typeof updateMenuStates === 'function') updateMenuStates();
    }

    function parseTextToTree(text) {
        const lines = text.split('\n');
        const root = { children: [], path: "" };
        const stack = [{ level: -1, node: root }];

        lines.forEach((line, index) => {
            if (line.trim() === '') return;
            const indentMatch = line.match(/^(\s*)/);
            const indentLevel = indentMatch ? indentMatch[1].length : 0;
            const name = line.trim();
            const isFile = name.includes('.'); 
            
            while (stack.length > 1 && stack[stack.length - 1].level >= indentLevel) {
                stack.pop();
            }
            const parent = stack[stack.length - 1].node;
            const path = parent.path ? `${parent.path}/${name}` : name;
            
            const node = { name, isFile, children: [], path: path, lineIndex: index, indentLevel: indentLevel };
            parent.children.push(node);
            stack.push({ level: indentLevel, node: node });
        });
        return root.children;
    }

    function getFileInfo(filename) {
        const extMatch = filename.match(/\.([^.]+)$/);
        const ext = extMatch ? extMatch[1].toLowerCase() : '';
        switch (ext) {
            case 'html': case 'htm': return { icon: 'file-code', color: 'file-color-html' };
            case 'css': return { icon: 'file-code', color: 'file-color-css' };
            case 'js': case 'jsx': case 'ts': case 'tsx': return { icon: 'file-code', color: 'file-color-js' };
            case 'json': return { icon: 'file-json', color: 'file-color-json' };
            case 'jpg': case 'jpeg': case 'png': case 'gif': case 'svg': case 'webp': case 'ico': return { icon: 'image', color: 'file-color-img' };
            case 'pdf': return { icon: 'file-text', color: 'file-color-pdf' };
            case 'doc': case 'docx': return { icon: 'file-text', color: 'file-color-doc' };
            case 'xls': case 'xlsx': case 'csv': return { icon: 'table', color: 'file-color-xls' };
            case 'ppt': case 'pptx': return { icon: 'projector', color: 'file-color-html' };
            case 'zip': case 'rar': case '7z': case 'tar': case 'gz': return { icon: 'file-archive', color: 'file-color-archive' };
            case 'mp3': case 'wav': case 'ogg': return { icon: 'file-audio', color: 'file-color-audio' };
            case 'mp4': case 'mkv': case 'avi': return { icon: 'file-video', color: 'file-color-video' };
            case 'env': case 'gitignore': case 'config': return { icon: 'settings', color: 'file-color-config' };
            case 'md': case 'txt': return { icon: 'file-text', color: 'file-color-default' };
            default: return { icon: 'file', color: 'file-color-default' };
        }
    }

    function renderTreeHTML(nodes) {
        if (nodes.length === 0) return '';
        let html = '<ul class="tree-list">';
        nodes.forEach(node => {
            if (node.isFile) {
                const fileInfo = getFileInfo(node.name);
                html += `
                    <li class="tree-item is-file" draggable="true" data-line="${node.lineIndex}">
                        <div class="tree-content">
                            <span class="tree-arrow empty"></span>
                            <i data-lucide="${fileInfo.icon}" class="tree-icon ${fileInfo.color}"></i>
                            <span class="tree-name">${node.name}</span>
                            <div class="tree-actions">
                                <button class="tree-btn tree-delete-btn" title="Excluir" data-line="${node.lineIndex}" data-indent="${node.indentLevel}" data-type="file"><i data-lucide="x" style="width:14px;height:14px;pointer-events:none;"></i></button>
                            </div>
                        </div>
                    </li>
                `;
            } else {
                const hasChildren = node.children.length > 0;
                const isExplicitlyClosed = closedFoldersState.has(node.path);
                const isOpen = hasChildren && !isExplicitlyClosed;
                const arrowHTML = hasChildren ? `<span class="tree-arrow"><i data-lucide="chevron-down" class="tree-arrow-icon"></i></span>` : `<span class="tree-arrow empty"></span>`;
                const iconName = isOpen ? 'folder-open' : 'folder';

                html += `
                    <li class="tree-item is-folder ${isOpen ? 'open' : 'closed'}" draggable="true" data-path="${node.path}" data-line="${node.lineIndex}">
                        <div class="tree-content">
                            ${arrowHTML}
                            <i data-lucide="${iconName}" class="tree-icon tree-lucide-folder"></i>
                            <span class="tree-name">${node.name}</span>
                            <div class="tree-actions">
                                <button class="tree-btn tree-add-btn" title="Adicionar" data-line="${node.lineIndex}" data-indent="${node.indentLevel}"><i data-lucide="plus" style="width:14px;height:14px;pointer-events:none;"></i></button>
                                <button class="tree-btn tree-delete-btn" title="Excluir" data-line="${node.lineIndex}" data-indent="${node.indentLevel}" data-type="folder"><i data-lucide="x" style="width:14px;height:14px;pointer-events:none;"></i></button>
                            </div>
                        </div>
                        ${hasChildren ? `
                            <div class="tree-list-wrapper">
                                ${renderTreeHTML(node.children)}
                            </div>
                        ` : ''}
                    </li>
                `;
            }
        });
        html += '</ul>';
        return html;
    }

    // ==========================================
    // --- RENOMEAR INLINE (COM PAUSA) ---
    // ==========================================
    function startRenaming(liElement, isNewItem = false) {
        window.isRenamingActive = true; 

        const lineIndex = parseInt(liElement.getAttribute('data-line'), 10);
        const nameSpan = liElement.querySelector(':scope > .tree-content .tree-name');
        if (!nameSpan || nameSpan.querySelector('input')) return; 
        
        const lines = editor.value.split('\n');
        const originalLine = lines[lineIndex];
        const indentMatch = originalLine.match(/^(\s*)/);
        const indentStr = indentMatch ? indentMatch[1] : '';
        const originalName = originalLine.replace(/^(\s*)/, '');
        
        const inputValue = isNewItem ? "" : originalName;
        const placeholder = isNewItem ? "Novo item" : "";
        
        nameSpan.innerHTML = `<input type="text" class="inline-edit-input" value="${inputValue}" placeholder="${placeholder}">`;
        const input = nameSpan.querySelector('input');
        input.focus();
        if (!isNewItem) input.select();
        
        let isFinished = false;
        
        const finishEdit = (isCancelled = false) => {
            if (isFinished) return;
            isFinished = true;
            
            const finalName = input.value.trim();
            const currentLines = editor.value.split('\n');
            
            if (isCancelled || finalName === '') {
                if (isNewItem) currentLines.splice(lineIndex, 1); 
                else currentLines[lineIndex] = indentStr + originalName; 
            } else {
                currentLines[lineIndex] = indentStr + finalName; 
            }
            
            editor.value = currentLines.join('\n');
            window.isRenamingActive = false; 

            updateTree();
            
            if (!isCancelled) {
                if (typeof setUnsavedState === 'function') setUnsavedState(true);
                if (typeof updateMenuStates === 'function') updateMenuStates();
                if (typeof window.saveHistoryState === 'function') window.saveHistoryState();
            }
        };

        input.addEventListener('blur', () => finishEdit(false));
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault(); 
                finishEdit(false);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                finishEdit(true);
            }
            e.stopPropagation(); 
        });
        input.addEventListener('click', (e) => e.stopPropagation());
    }

    function getBlockEndIndex(linesArray, startIndex) {
        const startIndentMatch = linesArray[startIndex].match(/^(\s*)/);
        const startIndent = startIndentMatch ? startIndentMatch[1].length : 0;
        let endIndex = startIndex;
        for (let i = startIndex + 1; i < linesArray.length; i++) {
            const line = linesArray[i];
            if (line.trim() === '') continue; 
            const nextIndentMatch = line.match(/^(\s*)/);
            const nextIndent = nextIndentMatch ? nextIndentMatch[1].length : 0;
            if (nextIndent <= startIndent) break; 
            endIndex = i; 
        }
        return endIndex;
    }

    function clearSelection() {
        document.querySelectorAll('.tree-content.selected').forEach(el => el.classList.remove('selected'));
        document.querySelectorAll('.tree-item.is-selected').forEach(el => el.classList.remove('is-selected'));
    }

    // ==========================================
    // --- EVENTOS DO EDITOR (TECLADO) ---
    // ==========================================
    let debounceHistoryTimeout;

    editor.addEventListener('input', () => {
        updateTree();
        syncVisualScroll(); 
        
        if (typeof setUnsavedState === 'function') setUnsavedState(true);
        if (typeof updateMenuStates === 'function') updateMenuStates();
        
        clearTimeout(debounceHistoryTimeout);
        debounceHistoryTimeout = setTimeout(() => {
            if (typeof saveHistoryState === 'function' && typeof isHistoryAction !== 'undefined' && !isHistoryAction) {
                saveHistoryState();
            }
        }, 400);
    });

    editor.addEventListener('click', () => { 
        clearSelection(); 
        syncVisualScroll(); 
    });

    editor.addEventListener('keyup', (e) => {
        syncVisualScroll(); 
        if (e.key === ' ' || e.key === 'Enter') {
            clearTimeout(debounceHistoryTimeout); 
            if (typeof saveHistoryState === 'function' && typeof isHistoryAction !== 'undefined' && !isHistoryAction) {
                saveHistoryState();
            }
        }
    });

    editor.addEventListener('keydown', function(e) {
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = this.selectionStart;
            const end = this.selectionEnd;
            this.value = this.value.substring(0, start) + "  " + this.value.substring(end);
            this.selectionStart = this.selectionEnd = start + 2;
            updateTree();
            syncVisualScroll();
            
            clearTimeout(debounceHistoryTimeout);
            if (typeof saveHistoryState === 'function') saveHistoryState();
        }

        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
            e.preventDefault(); 
            e.stopPropagation(); 
            if (e.shiftKey) {
                if (typeof window.performRedo === 'function') window.performRedo();
            } else {
                if (typeof window.performUndo === 'function') window.performUndo();
            }
        }
        
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
            e.preventDefault();
            e.stopPropagation();
            if (typeof window.performRedo === 'function') window.performRedo();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'F2') {
            const selectedItems = document.querySelectorAll('.tree-item.is-selected');
            if (selectedItems.length === 1) {
                e.preventDefault();
                startRenaming(selectedItems[0], false);
            }
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
            e.preventDefault(); 
            if (typeof window.salvarProjetoNaNuvem === 'function') window.salvarProjetoNaNuvem();
        }
    });

    // ==========================================
    // --- DRAG AND DROP ---
    // ==========================================
    treeContainer.addEventListener('dragstart', (e) => {
        const li = e.target.closest('.tree-item');
        if (!li) return;
        
        const lines = editor.value.split('\n');
        let draggedNodes = [];

        if (li.classList.contains('is-selected')) {
            draggedNodes = Array.from(document.querySelectorAll('.tree-item.is-selected'));
            draggedNodes.forEach(node => node.classList.add('dragging'));
        } else {
            draggedNodes = [li];
            li.classList.add('dragging');
        }

        let rawBlocks = draggedNodes.map(node => {
            let start = parseInt(node.getAttribute('data-line'), 10);
            let end = getBlockEndIndex(lines, start);
            return { start, end };
        });

        rawBlocks.sort((a, b) => a.start - b.start);
        draggedBlocks = [];
        rawBlocks.forEach(block => {
            if (draggedBlocks.length === 0) {
                draggedBlocks.push(block);
            } else {
                let last = draggedBlocks[draggedBlocks.length - 1];
                if (block.start <= last.end) {
                    last.end = Math.max(last.end, block.end);
                } else {
                    draggedBlocks.push(block);
                }
            }
        });
        e.dataTransfer.effectAllowed = 'move';
    });

    treeContainer.addEventListener('dragover', (e) => {
        e.preventDefault(); 
        document.querySelectorAll('.drag-over-top, .drag-over-bottom, .drag-over-inside').forEach(el => {
            el.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-inside');
        });

        const contentDiv = e.target.closest('.tree-content');
        if (!contentDiv) return;

        const rect = contentDiv.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const li = contentDiv.closest('.tree-item');
        const isFolder = li.classList.contains('is-folder');
        const isOpen = li.classList.contains('open');

        if (y < rect.height * 0.25) {
            contentDiv.classList.add('drag-over-top');
        } else if (y > rect.height * 0.75) {
            if (isFolder && isOpen) contentDiv.classList.add('drag-over-inside'); 
            else contentDiv.classList.add('drag-over-bottom');
        } else {
            if (isFolder) contentDiv.classList.add('drag-over-inside');
            else contentDiv.classList.add('drag-over-bottom');
        }
    });

    treeContainer.addEventListener('dragleave', (e) => {
        const contentDiv = e.target.closest('.tree-content');
        if (contentDiv) contentDiv.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-inside');
    });

    treeContainer.addEventListener('drop', (e) => {
        e.preventDefault();
        const contentDiv = e.target.closest('.tree-content');
        if (!contentDiv) return;

        const position = contentDiv.classList.contains('drag-over-top') ? 'top' :
                         contentDiv.classList.contains('drag-over-bottom') ? 'bottom' : 'inside';
        contentDiv.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-inside');

        const targetLi = contentDiv.closest('.tree-item');
        const targetLineIndex = parseInt(targetLi.getAttribute('data-line'), 10);
        
        if (draggedBlocks.length === 0) return;

        const isInvalidDrop = draggedBlocks.some(b => targetLineIndex >= b.start && targetLineIndex <= b.end);
        if (isInvalidDrop) {
            alert("Operação inválida: Você não pode mover uma pasta para dentro de si mesma ou de seus subníveis.");
            return;
        }

        const lines = editor.value.split('\n');
        let linesToRemove = new Set();
        let movedLinesData = [];
        
        draggedBlocks.forEach(b => {
            for(let i = b.start; i <= b.end; i++) {
                linesToRemove.add(i);
                movedLinesData.push(lines[i]);
            }
        });

        const firstDraggedLine = lines[draggedBlocks[0].start];
        const sourceIndentMatch = firstDraggedLine.match(/^(\s*)/);
        const sourceIndent = sourceIndentMatch ? sourceIndentMatch[1].length : 0;

        let originalInsertIndex;
        const targetIndentMatch = lines[targetLineIndex].match(/^(\s*)/);
        const targetIndent = targetIndentMatch ? targetIndentMatch[1].length : 0;
        let newBaseIndent = targetIndent;

        if (position === 'top') {
            originalInsertIndex = targetLineIndex;
        } else if (position === 'bottom') {
            originalInsertIndex = getBlockEndIndex(lines, targetLineIndex) + 1;
        } else if (position === 'inside') {
            originalInsertIndex = targetLineIndex + 1;
            newBaseIndent = targetIndent + 2;
            closedFoldersState.delete(targetLi.getAttribute('data-path')); 
        }

        let removedAbove = 0;
        for (let i = 0; i < originalInsertIndex; i++) {
            if (linesToRemove.has(i)) removedAbove++;
        }
        let finalInsertIndex = originalInsertIndex - removedAbove;

        const indentDiff = newBaseIndent - sourceIndent;
        const finalMovedLines = movedLinesData.map(line => {
            if (line.trim() === '') return line;
            const currentIndentMatch = line.match(/^(\s*)/);
            const currentIndent = currentIndentMatch ? currentIndentMatch[1].length : 0;
            const newIndent = Math.max(0, currentIndent + indentDiff);
            return ' '.repeat(newIndent) + line.trim();
        });

        let remainingLines = lines.filter((_, idx) => !linesToRemove.has(idx));
        remainingLines.splice(finalInsertIndex, 0, ...finalMovedLines);
        
        editor.value = remainingLines.join('\n');
        updateTree();
        syncTextScroll(finalInsertIndex); 
        clearSelection();
        setUnsavedState(true); 
    });

    treeContainer.addEventListener('dragend', (e) => {
        document.querySelectorAll('.tree-item.dragging').forEach(el => el.classList.remove('dragging'));
        document.querySelectorAll('.drag-over-top, .drag-over-bottom, .drag-over-inside').forEach(el => el.classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over-inside'));
        draggedBlocks = [];
    });

    // ==========================================
    // --- CLIQUE NA ÁRVORE (MODAIS E AÇÕES) ---
    // ==========================================
    treeContainer.addEventListener('click', async (e) => {
        const isCtrlPressed = e.ctrlKey || e.metaKey;
        const isInputEdit = e.target.classList.contains('inline-edit-input');
        const isActionButton = e.target.closest('.tree-btn');
        const contentDiv = e.target.closest('.tree-content');
        
        if (e.target.closest('.add-root-btn')) {
            e.stopPropagation();
            let lines = editor.value.split('\n');
            let insertIndex = 0;
            const defaultName = "Novo_Item";
            
            if (editor.value.trim() === '') {
                lines = [defaultName];
                insertIndex = 0;
            } else {
                const selectedItems = document.querySelectorAll('.tree-item.is-selected');
                if (selectedItems.length > 0) {
                    let lastSelectedLine = -1;
                    selectedItems.forEach(item => {
                        const idx = parseInt(item.getAttribute('data-line'), 10);
                        if (idx > lastSelectedLine) lastSelectedLine = idx;
                    });
                    const blockEnd = getBlockEndIndex(lines, lastSelectedLine);
                    insertIndex = blockEnd + 1;
                    lines.splice(insertIndex, 0, defaultName); 
                } else {
                    while(lines.length > 0 && lines[lines.length-1].trim() === '') lines.pop();
                    insertIndex = lines.length;
                    lines.push(defaultName); 
                }
            }

            editor.value = lines.join('\n');
            updateTree();
            syncTextScroll(insertIndex); 
            setUnsavedState(true);

            const newItemLi = treeContainer.querySelector(`li[data-line="${insertIndex}"]`);
            if (newItemLi) startRenaming(newItemLi, true);
            return;
        }

        if (!isCtrlPressed && !isInputEdit && !isActionButton) clearSelection();

        if (isCtrlPressed) {
            if (contentDiv && !isActionButton && !isInputEdit) {
                e.preventDefault();
                contentDiv.classList.toggle('selected');
                contentDiv.closest('.tree-item').classList.toggle('is-selected');
            }
            return; 
        }

        if (e.target.closest('.tree-delete-btn')) {
            e.stopPropagation();
            const btn = e.target.closest('.tree-delete-btn');
            const lineIndex = parseInt(btn.getAttribute('data-line'), 10);
            const indentLevel = parseInt(btn.getAttribute('data-indent'), 10);
            const isFolder = btn.getAttribute('data-type') === 'folder';
            const lines = editor.value.split('\n');

            if (!isFolder) {
                const res = await showCustomConfirm(
                    "Excluir Arquivo",
                    `Deseja realmente apagar este arquivo?`,
                    [
                        { label: "Cancelar", value: false, class: "btn-outline" },
                        { label: "<i data-lucide='trash-2' class='icon-sm'></i> Excluir", value: true, class: "btn-danger" }
                    ]
                );
                if (res) {
                    lines.splice(lineIndex, 1);
                    editor.value = lines.join('\n');
                    updateTree();
                }
                return;
            }

            const res = await showCustomConfirm(
                "Excluir Pasta",
                "O que deseja fazer com os arquivos e subpastas que estão dentro dela?",
                [
                    { label: "Cancelar", value: "cancel", class: "btn-outline" },
                    { label: "Manter Conteúdo (Solto)", value: "keep", class: "btn-primary" },
                    { label: "<i data-lucide='trash-2' class='icon-sm'></i> Excluir Tudo", value: "delete_all", class: "btn-danger" }
                ]
            );

            if (res === "delete_all") {
                const deleteCount = getBlockEndIndex(lines, lineIndex) - lineIndex + 1;
                lines.splice(lineIndex, deleteCount);
                editor.value = lines.join('\n');
                updateTree();
                setUnsavedState(true);
            } else if (res === "keep") {
                lines.splice(lineIndex, 1);
                let currentIndex = lineIndex;
                while (currentIndex < lines.length) {
                    const line = lines[currentIndex];
                    if (line.trim() !== '') {
                        const match = line.match(/^(\s*)/);
                        const currentIndent = match ? match[1].length : 0;
                        if (currentIndent <= indentLevel) break;
                        lines[currentIndex] = line.replace(/^\s{2}/, '');
                    }
                    currentIndex++;
                }
                editor.value = lines.join('\n');
                updateTree();
                setUnsavedState(true);
            }
            return;
        }

        if (e.target.closest('.tree-add-btn')) {
            e.stopPropagation();
            const btn = e.target.closest('.tree-add-btn');
            const folderLineIndex = parseInt(btn.getAttribute('data-line'), 10);
            const folderIndentLevel = parseInt(btn.getAttribute('data-indent'), 10);
            const lines = editor.value.split('\n');

            const insertIndex = getBlockEndIndex(lines, folderLineIndex) + 1;
            const newIndent = ' '.repeat(folderIndentLevel + 2);

            lines.splice(insertIndex, 0, newIndent + "Novo_Item"); 
            editor.value = lines.join('\n');
            closedFoldersState.delete(btn.closest('.is-folder').getAttribute('data-path'));
            updateTree();
            setUnsavedState(true);
            syncTextScroll(insertIndex); 
            
            const newItemLi = treeContainer.querySelector(`li[data-line="${insertIndex}"]`);
            if (newItemLi) startRenaming(newItemLi, true); 
            return;
        }

        if (isInputEdit) return;
        if (!contentDiv) return;

        const li = contentDiv.parentElement;
        if (li && !isActionButton) {
            const lineIndex = parseInt(li.getAttribute('data-line'), 10);
            syncTextScroll(lineIndex);
        }

        if (li.classList.contains('is-folder')) {
            if (!li.querySelector(':scope > .tree-list-wrapper')) return;
            li.classList.toggle('open');
            li.classList.toggle('closed');
            
            const isOpen = li.classList.contains('open');
            const path = li.getAttribute('data-path');
            
            if (isOpen) closedFoldersState.delete(path); else closedFoldersState.add(path);
            
            const icon = li.querySelector(':scope > .tree-content .tree-icon');
            if (icon) {
                icon.innerHTML = ''; 
                icon.setAttribute('data-lucide', isOpen ? 'folder-open' : 'folder');
            }
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    });

    // ==========================================
    // --- MENUS, TEMAS ---
    // ==========================================
    const btnTemplates = document.getElementById('btn-templates'); 
    const btnExport = document.getElementById('btn-export'); 
    const btnImport = document.getElementById('btn-import');
    const fileImport = document.getElementById('file-import');
    const themeToggle = document.getElementById('theme-toggle');
    const hamburgerBtn = document.getElementById('mobile-menu-btn');
    const toolbarLinks = document.getElementById('toolbar-links');

    const currentTheme = localStorage.getItem('theme');
    if (currentTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        if (themeToggle) themeToggle.innerHTML = '<i data-lucide="sun"></i>';
    }
    
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            let theme = document.documentElement.getAttribute('data-theme');
            if (theme === 'dark') {
                document.documentElement.removeAttribute('data-theme');
                localStorage.setItem('theme', 'light');
                themeToggle.innerHTML = '<i data-lucide="moon"></i>';
            } else {
                document.documentElement.setAttribute('data-theme', 'dark');
                localStorage.setItem('theme', 'dark');
                themeToggle.innerHTML = '<i data-lucide="sun"></i>';
            }
            if (typeof lucide !== 'undefined') lucide.createIcons();
        });
    }

    if (hamburgerBtn && toolbarLinks) {
        hamburgerBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toolbarLinks.classList.toggle('show');
            hamburgerBtn.classList.toggle('is-active');
            if (!toolbarLinks.classList.contains('show')) {
                hamburgerBtn.innerHTML = '<i data-lucide="menu"></i>';
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
        });
    }

    function closeAllDropdowns() {
        document.querySelectorAll('.dropdown-menu.show').forEach(menu => menu.classList.remove('show'));
    }

    document.addEventListener('click', (e) => {
        if (hamburgerBtn && toolbarLinks && !e.target.closest('.toolbar-links') && !e.target.closest('#mobile-menu-btn')) {
            if (toolbarLinks.classList.contains('show')) {
                toolbarLinks.classList.remove('show');
                hamburgerBtn.classList.remove('is-active');
                hamburgerBtn.innerHTML = '<i data-lucide="menu"></i>';
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
        }
        if (!e.target.closest('.dropdown-wrapper')) {
            closeAllDropdowns();
        }
    });

    // --- IMPORTAÇÃO ---
    if (btnImport && fileImport) {
        btnImport.addEventListener('click', async () => {
            if (editor.value.trim() !== '') {
                const res = await showCustomConfirm(
                    "Importar Arquivo",
                    "Importar um arquivo apagará a sua estrutura atual. Deseja continuar?",
                    [
                        { label: "Cancelar", value: false, class: "btn-outline" },
                        { label: "<i data-lucide='upload' class='icon-sm'></i> Sim, importar", value: true, class: "btn-primary" }
                    ]
                );
                if (!res) return;
            }
            fileImport.click();
        });

        fileImport.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                const content = event.target.result;
                if (file.name.toLowerCase().endsWith('.json')) {
                    try {
                        const jsonData = JSON.parse(content);
                        editor.value = convertJsonToText(jsonData);
                        updateTree();
                    } catch (err) {
                        alert("Erro: O arquivo JSON parece estar corrompido ou em um formato inválido.");
                    }
                } else {
                    editor.value = content;
                    updateTree();
                }
                editor.scrollTo({ top: 0, behavior: 'smooth' });
                fileImport.value = ''; 
                
                if (toolbarLinks) {
                    toolbarLinks.classList.remove('show');
                    if (hamburgerBtn) hamburgerBtn.classList.remove('is-active');
                }
            };
            reader.readAsText(file);
        });
    }

    function convertJsonToText(nodes, indentLevel = 0) {
        let text = '';
        const spaces = ' '.repeat(indentLevel);
        nodes.forEach(node => {
            text += spaces + node.name + '\n';
            if (node.children && node.children.length > 0) {
                text += convertJsonToText(node.children, indentLevel + 2);
            }
        });
        return text;
    }

    // --- TEMPLATES ---
    const templatesData = {
        'Desenvolvimento Web': "src/\n  assets/\n    images/\n      logo.svg\n      hero.jpg\n    css/\n      style.css\n    js/\n      main.js\n  index.html\n  about.html\nREADME.md",
        'API Backend': "api/\n  controllers/\n    userController.js\n  models/\n    userModel.js\n  routes/\n    userRoutes.js\nconfig/\n  database.js\n.env\nserver.js\npackage.json",
        'Projeto de Design': "Projeto_Identidade_Visual/\n  01_Referencias/\n    moodboard.pdf\n    concorrentes.png\n  02_Aprovacao/\n    apresentacao_v1.pdf\n  03_Arquivos_Finais/\n    Logo/\n      logo_primaria.ai\n      logo_secundaria.ai\n    Tipografia/\n      fontes.zip\nbriefing.docx"
    };

    const dropdownMenu = document.createElement('div');
    dropdownMenu.className = 'dropdown-menu';
    
    Object.keys(templatesData).forEach(templateName => {
        const btn = document.createElement('button');
        btn.className = 'dropdown-item';
        btn.innerHTML = `<i data-lucide="file-json" class="icon-sm"></i> ${templateName}`;
        btn.addEventListener('click', async () => {
            if (editor.value.trim() !== '') {
                const res = await showCustomConfirm(
                    "Carregar Template",
                    "Carregar um template apagará a estrutura atual da tela. Deseja continuar?",
                    [
                        { label: "Cancelar", value: false, class: "btn-outline" },
                        { label: "<i data-lucide='check' class='icon-sm'></i> Sim, carregar", value: true, class: "btn-primary" }
                    ]
                );
                if (!res) {
                    dropdownMenu.classList.remove('show');
                    return;
                }
            }
            editor.value = templatesData[templateName];
            dropdownMenu.classList.remove('show');
            
            if (toolbarLinks) {
                toolbarLinks.classList.remove('show');
                if (hamburgerBtn) hamburgerBtn.classList.remove('is-active');
            }
            
            updateTree();
            editor.scrollTo({ top: 0, behavior: 'smooth' });
        });
        dropdownMenu.appendChild(btn);
    });
    
    if (btnTemplates) {
        const wrapperTemplates = btnTemplates.closest('.dropdown-wrapper');
        if (wrapperTemplates) wrapperTemplates.appendChild(dropdownMenu);
        
        btnTemplates.addEventListener('click', (e) => {
            e.stopPropagation();
            const isShowing = dropdownMenu.classList.contains('show');
            closeAllDropdowns(); 
            if (!isShowing) dropdownMenu.classList.add('show');
        });
    }

    // ==========================================
    // --- O SALVADOR BLINDADO (INSTANTÂNEO) ---
    // ==========================================
    
    // 1. Ele abre a janela do Windows na hora (antes de processar qualquer imagem)!
    async function getFileHandle(defaultFilename, acceptTypes, description) {
        if (window.showSaveFilePicker) {
            try {
                return await window.showSaveFilePicker({
                    suggestedName: defaultFilename,
                    types: [{ description: description, accept: acceptTypes }],
                });
            } catch (err) {
                if (err.name === 'AbortError' || err.message.includes('aborted')) return 'CANCELLED';
                console.warn("Janela nativa bloqueada. Usando fallback."); // Silencia erros locais
            }
        }
        return null; // Avisa o código para usar o Fallback Clássico
    }

    // 2. Ele salva o arquivo usando a pasta escolhida (ou cai direto no Downloads se der erro)
    async function writeBlobToFile(blob, fileHandle, defaultFilename) {
        if (fileHandle && fileHandle !== 'CANCELLED') {
            const writable = await fileHandle.createWritable();
            await writable.write(blob);
            await writable.close();
        } else if (fileHandle !== 'CANCELLED') {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = defaultFilename;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
        }
    }

    // --- FUNÇÕES DE EXPORTAÇÃO ---
    async function exportToTxt() {
        if (editor.value.trim() === '') return showToast("⚠️ A estrutura está vazia!");
        const handle = await getFileHandle("Estrutura_Projeto.txt", { 'text/plain': ['.txt'] }, "Arquivo de Texto");
        if (handle === 'CANCELLED') return;

        const blob = new Blob([editor.value], { type: "text/plain;charset=utf-8" });
        await writeBlobToFile(blob, handle, "Estrutura_Projeto.txt");
        showToast("✅ Arquivo TXT salvo!");
    }

    async function exportToJson() {
        if (editor.value.trim() === '') return showToast("⚠️ A estrutura está vazia!");
        const handle = await getFileHandle("Estrutura_Projeto.json", { 'application/json': ['.json'] }, "Arquivo JSON");
        if (handle === 'CANCELLED') return;

        const data = parseTextToTree(editor.value);
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
        await writeBlobToFile(blob, handle, "Estrutura_Projeto.json");
        showToast("✅ Arquivo JSON salvo!");
    }

    async function exportToZip() {
        if (editor.value.trim() === '') return showToast("⚠️ A estrutura está vazia!");
        if (typeof JSZip === 'undefined') return showToast("❌ Erro: JSZip não encontrado.");

        const handle = await getFileHandle("Projeto_Estrutura.zip", { 'application/zip': ['.zip'] }, "Arquivo ZIP");
        if (handle === 'CANCELLED') return;

        showToast("⏳ Gerando arquivo ZIP...");

        const data = parseTextToTree(editor.value);
        const zip = new JSZip();

        function buildZipStructure(nodes, currentFolder) {
            nodes.forEach(node => {
                if (!node.isFile) {
                    const newFolder = currentFolder.folder(node.name);
                    buildZipStructure(node.children, newFolder);
                }
            });
        }
        buildZipStructure(data, zip);

        try {
            const blob = await zip.generateAsync({ type: "blob" });
            await writeBlobToFile(blob, handle, "Projeto_Estrutura.zip");
            showToast("✅ Arquivo ZIP salvo!");
        } catch (error) {
            showToast("❌ Erro ao compactar arquivos.");
        }
    }

    async function exportToPng() {
        if (editor.value.trim() === '') return showToast("⚠️ A estrutura está vazia!");
        if (typeof html2canvas === 'undefined') return showToast("❌ Erro: html2canvas não encontrado.");

        // Abre a janela do Windows PRIMEIRO, de forma instantânea!
        const handle = await getFileHandle("Estrutura_Visual.png", { 'image/png': ['.png'] }, "Imagem PNG");
        if (handle === 'CANCELLED') return;

        showToast("⏳ Processando imagem. Aguarde...");

        const rootBtn = treeContainer.querySelector('.add-root-btn');
        const emptySpace = treeContainer.querySelector('.tree-spacer');
        
        if (rootBtn) rootBtn.style.display = 'none';
        if (emptySpace) emptySpace.style.display = 'none';

        clearSelection();

        const originalOverflow = treeContainer.style.overflow;
        const originalHeight = treeContainer.style.height;
        const originalWidth = treeContainer.style.width;

        treeContainer.style.overflow = 'visible';
        treeContainer.style.height = 'max-content';
        treeContainer.style.width = 'max-content';

        try {
            const bgColor = window.getComputedStyle(document.body).getPropertyValue('--panel-bg').trim() || '#ffffff';
            
            // REMOVIDO o useCORS para não causar travamentos no arquivo local!
            const canvas = await html2canvas(treeContainer, {
                backgroundColor: bgColor,
                scale: 2,
                scrollY: -window.scrollY 
            });
            
            canvas.toBlob(async (blob) => {
                await writeBlobToFile(blob, handle, "Estrutura_Visual.png");
                showToast("✅ Imagem salva com sucesso!");
            });
        } catch (error) {
            console.error(error);
            showToast("❌ Erro ao exportar imagem.");
        } finally {
            treeContainer.style.overflow = originalOverflow;
            treeContainer.style.height = originalHeight;
            treeContainer.style.width = originalWidth;
            if (rootBtn) rootBtn.style.display = '';
            if (emptySpace) emptySpace.style.display = '';
        }
    }

    // --- RECONECTANDO SEUS BOTÕES NO MENU ---
    const menuImportar = document.getElementById('menu-importar');
    if (menuImportar) {
        menuImportar.addEventListener('click', () => { 
            if(menuArquivoDropdown) menuArquivoDropdown.classList.remove('show');
            if(fileImport) fileImport.click(); 
        });
    }
    
    const menuExpPng = document.getElementById('menu-exp-png');
    if(menuExpPng) menuExpPng.addEventListener('click', () => { if(menuArquivoDropdown) menuArquivoDropdown.classList.remove('show'); exportToPng(); });
    
    const menuExpZip = document.getElementById('menu-exp-zip');
    if(menuExpZip) menuExpZip.addEventListener('click', () => { if(menuArquivoDropdown) menuArquivoDropdown.classList.remove('show'); exportToZip(); });
    
    const menuExpJson = document.getElementById('menu-exp-json');
    if(menuExpJson) menuExpJson.addEventListener('click', () => { if(menuArquivoDropdown) menuArquivoDropdown.classList.remove('show'); exportToJson(); });
    
    const menuExpTxt = document.getElementById('menu-exp-txt');
    if(menuExpTxt) menuExpTxt.addEventListener('click', () => { if(menuArquivoDropdown) menuArquivoDropdown.classList.remove('show'); exportToTxt(); });

    // Botões que porventura estejam soltos na barra de ferramentas
    const btnToolbarExportImg = document.getElementById('btn-export-img');
    if (btnToolbarExportImg) btnToolbarExportImg.addEventListener('click', exportToPng);

    const btnToolbarExportFlow = document.getElementById('btn-export-flow');
    if (btnToolbarExportFlow) btnToolbarExportFlow.addEventListener('click', () => { if(btnMindmap) btnMindmap.click(); });

    // ==========================================
    // --- FLUXOGRAMA (MAPA MENTAL COM MERMAID) ---
    // ==========================================
    const btnMindmap = document.getElementById('btn-mindmap');
    const modalOverlay = document.getElementById('modal-overlay');
    const closeMindmapBtn = document.getElementById('close-mindmap');
    const mindmapContainer = document.getElementById('mindmap-container');

    function generateMermaidSyntax(nodes) {
        let syntax = "graph LR\n";
        syntax += '  root(("📦 PROJETO"))\n'; 

        let counter = 0;
        function traverse(nodeList, parentId) {
            nodeList.forEach(node => {
                counter++;
                const nodeId = 'node' + counter;
                const safeName = node.name.replace(/["\\[\]()]/g, '');
                const shape = node.isFile ? `["📄 ${safeName}"]` : `("📂 ${safeName}")`;
                
                syntax += `  ${nodeId}${shape}\n`;
                syntax += `  ${parentId} --> ${nodeId}\n`;

                if (node.children && node.children.length > 0) {
                    traverse(node.children, nodeId);
                }
            });
        }
        traverse(nodes, 'root');
        return syntax;
    }

    if (btnMindmap) {
        btnMindmap.addEventListener('click', () => {
            const text = editor.value;
            if (text.trim() === '') return alert("A estrutura está vazia!");
            
            const treeData = parseTextToTree(text); 
            const mermaidSyntax = generateMermaidSyntax(treeData);
            
            mindmapContainer.innerHTML = `<div class="mermaid">${mermaidSyntax}</div>`;
            
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            mermaid.initialize({ startOnLoad: false, theme: isDark ? 'dark' : 'default' });
            
            modalOverlay.classList.add('show');
            mermaid.init(undefined, mindmapContainer.querySelectorAll('.mermaid'));
            
            if (toolbarLinks) {
                toolbarLinks.classList.remove('show');
                if (hamburgerBtn) hamburgerBtn.classList.remove('is-active');
                const icon = hamburgerBtn.querySelector('i');
                if (icon && icon.getAttribute('data-lucide') === 'x') {
                    icon.setAttribute('data-lucide', 'menu');
                    if (typeof lucide !== 'undefined') lucide.createIcons();
                }
            }
        });
    }

    if (closeMindmapBtn) {
        closeMindmapBtn.addEventListener('click', () => {
            modalOverlay.classList.remove('show');
        });
    }

    if (modalOverlay) {
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                modalOverlay.classList.remove('show');
            }
        });
    }

    const btnExportMindmap = document.getElementById('btn-export-mindmap');
    if (btnExportMindmap) {
        btnExportMindmap.addEventListener('click', async () => {
            const svgElement = mindmapContainer.querySelector('svg');
            if (!svgElement) return showToast("⚠️ O fluxograma ainda não foi gerado.");

            // Abre a janela do Windows PRIMEIRO!
            const handle = await getFileHandle("Fluxograma_Projeto.png", { 'image/png': ['.png'] }, "Imagem PNG");
            if (handle === 'CANCELLED') return;

            showToast("⏳ Processando imagem...");

            const bgColor = window.getComputedStyle(document.body).getPropertyValue('--panel-bg').trim() || '#ffffff';
            const originalOverflow = mindmapContainer.style.overflow;
            mindmapContainer.style.overflow = 'visible';

            try {
                // SEM CORS também!
                const canvas = await html2canvas(mindmapContainer, {
                    backgroundColor: bgColor,
                    scale: 2 
                });

                mindmapContainer.style.overflow = originalOverflow;

                canvas.toBlob(async (blob) => {
                    await writeBlobToFile(blob, handle, "Fluxograma_Projeto.png");
                    showToast("✅ Imagem do Fluxograma salva!");
                });
            } catch (error) {
                mindmapContainer.style.overflow = originalOverflow;
                console.error(error);
                showToast("❌ Erro ao exportar imagem.");
            }
        });
    }

    const btnExportSvg = document.getElementById('btn-export-svg');
    if (btnExportSvg) {
        btnExportSvg.addEventListener('click', async () => {
            const svgElement = mindmapContainer.querySelector('svg');
            if (!svgElement) return showToast("⚠️ O fluxograma ainda não foi gerado.");

            const handle = await getFileHandle("Fluxograma_Vetor.svg", { 'image/svg+xml': ['.svg'] }, "Vetor SVG");
            if (handle === 'CANCELLED') return;

            let svgData = svgElement.outerHTML;
            if (!svgData.match(/^<svg[^>]+xmlns="http\:\/\/www\.w3\.org\/2000\/svg"/)) {
                svgData = svgData.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
            }
            const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });

            try {
                await writeBlobToFile(blob, handle, "Fluxograma_Vetor.svg");
                showToast("✅ Arquivo SVG salvo!");
            } catch (error) {
                console.error(error);
                showToast("❌ Erro ao exportar o vetor.");
            }
        });
    }

    // ==========================================
    // --- AUTENTICAÇÃO E NUVEM ---
    // ==========================================
    const btnLoginModal = document.getElementById('btn-login-modal');
    const modalAuth = document.getElementById('modal-auth');
    const closeAuth = document.getElementById('close-auth');
    const authEmail = document.getElementById('auth-email');
    const authPassword = document.getElementById('auth-password');
    const btnSubmitAuth = document.getElementById('btn-submit-auth');
    const authToggleLink = document.getElementById('auth-toggle-link');
    const authTitle = document.getElementById('auth-title');
    const authSubtitle = document.getElementById('auth-subtitle');
    const authToggleText = document.getElementById('auth-toggle-text');
    const userNameDisplay = document.getElementById('user-name-display');

    let isLoginMode = true;
    let currentUser = null; 

    if (authToggleLink) {
        authToggleLink.addEventListener('click', (e) => {
            e.preventDefault();
            isLoginMode = !isLoginMode;
            if (isLoginMode) {
                authTitle.textContent = "Acesse sua Conta";
                authSubtitle.textContent = "Salve seus projetos na nuvem e acesse de qualquer lugar.";
                btnSubmitAuth.textContent = "Entrar";
                authToggleText.textContent = "Não tem uma conta?";
                authToggleLink.textContent = "Criar conta grátis";
            } else {
                authTitle.textContent = "Criar Nova Conta";
                authSubtitle.textContent = "Junte-se para salvar e compartilhar suas estruturas.";
                btnSubmitAuth.textContent = "Cadastrar";
                authToggleText.textContent = "Já tem uma conta?";
                authToggleLink.textContent = "Fazer login";
            }
        });
    }

    if (btnLoginModal) {
        btnLoginModal.addEventListener('click', async () => {
            if (currentUser) {
                const res = await showCustomConfirm(
                    "Sair da Conta", 
                    "Deseja realmente desconectar sua conta deste dispositivo?", 
                    [
                        { label: "Cancelar", value: false, class: "btn-outline" },
                        { label: "Sair", value: true, class: "btn-danger" }
                    ]
                );
                if (res) {
                    await supabase.auth.signOut();
                    showToast("Você saiu da conta.");
                }
            } else {
                modalAuth.classList.add('show');
            }
        });
    }

    if (closeAuth) closeAuth.addEventListener('click', () => modalAuth.classList.remove('show'));

    if (btnSubmitAuth && window.supabase) {
        btnSubmitAuth.addEventListener('click', async () => {
            const email = authEmail.value.trim();
            const password = authPassword.value.trim();

            if (!email || !password) return alert("Por favor, preencha e-mail e senha.");

            const textoOriginal = btnSubmitAuth.textContent;
            btnSubmitAuth.innerHTML = '<i data-lucide="loader" class="icon-sm"></i> Aguarde...';
            if (typeof lucide !== 'undefined') lucide.createIcons();
            btnSubmitAuth.disabled = true;

            try {
                if (isLoginMode) {
                    const { error } = await supabase.auth.signInWithPassword({ email, password });
                    if (error) throw error;
                    showToast("Bem-vindo de volta! 👋");
                } else {
                    const { error } = await supabase.auth.signUp({ email, password });
                    if (error) throw error;
                    showToast("Conta criada com sucesso! 🎉");
                }
                modalAuth.classList.remove('show');
                authEmail.value = '';
                authPassword.value = '';
            } catch (err) {
                console.error("Erro na autenticação:", err);
                alert("Erro: " + (err.message || "Verifique seus dados e tente novamente."));
            } finally {
                btnSubmitAuth.textContent = textoOriginal;
                btnSubmitAuth.disabled = false;
            }
        });
    }

    const btnMyProjects = document.getElementById('btn-my-projects');

    if (window.supabase) {
        supabase.auth.onAuthStateChange((event, session) => {
            if (session) {
                currentUser = session.user;
                const nomeCurto = currentUser.email.split('@')[0]; 
                if (userNameDisplay) userNameDisplay.textContent = nomeCurto;
                if (btnLoginModal) {
                    const icon = btnLoginModal.querySelector('i');
                    if (icon) icon.setAttribute('data-lucide', 'log-out');
                    btnLoginModal.classList.remove('btn-outline');
                    btnLoginModal.classList.add('btn-primary');
                }
                if (btnMyProjects) btnMyProjects.style.display = 'inline-flex';
            } else {
                currentUser = null;
                if (userNameDisplay) userNameDisplay.textContent = 'Entrar';
                if (btnLoginModal) {
                    const icon = btnLoginModal.querySelector('i');
                    if (icon) icon.setAttribute('data-lucide', 'user');
                    btnLoginModal.classList.add('btn-outline');
                    btnLoginModal.classList.remove('btn-primary');
                }
                if (btnMyProjects) btnMyProjects.style.display = 'none';
            }
            if (typeof lucide !== 'undefined') lucide.createIcons();
        });
    }

    // ==========================================
    // --- WORKSPACE E AÇÕES DE NUVEM ---
    // ==========================================
    let currentProjectId = null;
    let currentProjectName = "Sem Título";
    let hasUnsavedChanges = false;
    let autosaveTimeout = null;
    const AUTOSAVE_DELAY = 10000; 

    const projectTitleBadge = document.getElementById('project-title-badge');
    const unsavedIndicator = document.getElementById('unsaved-indicator');
    const autosaveStatus = document.getElementById('autosave-status');
    const btnArquivo = document.getElementById('btn-arquivo');
    const menuArquivoDropdown = document.getElementById('menu-arquivo-dropdown');

    function updateProjectUI(name) {
        currentProjectName = name || "Sem Título";
        const nameTextSpan = document.getElementById('project-name-text');
        if (nameTextSpan) nameTextSpan.textContent = currentProjectName;
    }

    function setUnsavedState(isUnsaved) {
        hasUnsavedChanges = isUnsaved;
        if (unsavedIndicator) unsavedIndicator.style.display = isUnsaved ? 'inline-block' : 'none';
        
        if (isUnsaved && currentProjectId && currentUser) {
            clearTimeout(autosaveTimeout);
            if (autosaveStatus) autosaveStatus.style.opacity = '0';
            autosaveTimeout = setTimeout(triggerAutosave, AUTOSAVE_DELAY);
        }
        updateMenuStates();
    }

    async function triggerAutosave() {
        if (!currentProjectId || !currentUser || !hasUnsavedChanges) return;
        try {
            const { error } = await supabase.from('projetos').update({ conteudo: editor.value.trim() }).eq('id', currentProjectId);
            if (error) throw error;
            setUnsavedState(false);
            if (autosaveStatus) {
                autosaveStatus.style.opacity = '1';
                setTimeout(() => autosaveStatus.style.opacity = '0', 3000);
            }
        } catch (err) {
            console.error("Erro no autosave:", err);
        }
    }

    function updateMenuStates() {
        const hasContent = editor.value.trim() !== '';
        const isCloudProject = currentProjectId !== null;

        const elSalvar = document.getElementById('menu-salvar');
        if (elSalvar) elSalvar.classList.toggle('disabled', !hasContent);
        
        ['menu-exp-png', 'menu-exp-zip', 'menu-exp-json', 'menu-exp-txt', 'menu-fechar'].forEach(id => {
            const el = document.getElementById(id);
            if(el) el.classList.toggle('disabled', !hasContent);
        });

        const elRenomear = document.getElementById('menu-renomear');
        const elCompartilhar = document.getElementById('menu-compartilhar');
        if (elRenomear) elRenomear.classList.toggle('disabled', !isCloudProject);
        if (elCompartilhar) elCompartilhar.classList.toggle('disabled', !isCloudProject);
    }

    window.addEventListener('beforeunload', (e) => {
        if (hasUnsavedChanges) {
            e.preventDefault();
            e.returnValue = '';
        }
    });

    window.salvarProjetoNaNuvem = async function() {
        if (!currentUser) return alert("Você precisa fazer login para salvar na nuvem!");
        if (editor.value.trim() === '') return alert("Sua árvore está vazia!");

        clearTimeout(autosaveTimeout);
        showToast("⏳ Salvando...");

        try {
            if (currentProjectId) {
                const { error } = await supabase.from('projetos').update({ conteudo: editor.value.trim() }).eq('id', currentProjectId);
                if (error) throw error;
                setUnsavedState(false);
                showToast("💾 Projeto atualizado!");
            } else {
                const nomeProjeto = prompt("Dê um nome para o seu projeto:", "Meu Novo Projeto");
                if (!nomeProjeto) return;

                const { data, error } = await supabase.from('projetos')
                    .insert([{ nome: nomeProjeto, conteudo: editor.value.trim(), user_id: currentUser.id }])
                    .select();
                
                if (error) throw error;
                
                currentProjectId = data[0].id;
                updateProjectUI(nomeProjeto);
                setUnsavedState(false);
                
                const novaUrl = window.location.origin + window.location.pathname + '?id=' + currentProjectId;
                window.history.pushState({ path: novaUrl }, '', novaUrl);
                
                showToast(`✅ Projeto "${nomeProjeto}" salvo!`);
            }
        } catch (err) {
            console.error("Erro ao salvar:", err);
            alert("Ocorreu um erro ao salvar na nuvem.");
        }
    };

    if (btnArquivo) {
        btnArquivo.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = menuArquivoDropdown.classList.contains('show');
            closeAllDropdowns(); 
            if (!isOpen) { 
                menuArquivoDropdown.classList.add('show');
                updateMenuStates();
            }
        });
    }

    document.getElementById('menu-novo').addEventListener('click', async () => {
        if(menuArquivoDropdown) menuArquivoDropdown.classList.remove('show');
        if (hasUnsavedChanges) {
            if (!confirm("Você tem alterações não salvas. Deseja mesmo descartá-las e começar do zero?")) return;
        } else if (editor.value.trim() !== '') {
            const res = await showCustomConfirm("Novo Projeto", "Começar um projeto em branco?", [
                { label: "Cancelar", value: false, class: "btn-outline" },
                { label: "Sim", value: true, class: "btn-primary" }
            ]);
            if (!res) return;
        }
        
        clearTimeout(autosaveTimeout);
        editor.value = '';
        currentProjectId = null;
        updateProjectUI("Sem Título");
        setUnsavedState(false);
        document.body.classList.remove('view-only-mode');
        
        const urlLimpa = window.location.origin + window.location.pathname;
        window.history.pushState({ path: urlLimpa }, '', urlLimpa);
        
        updateTree(); 
        const treeContainerArea = document.querySelector('.tree-content-area');
        if (treeContainerArea && editor.value === '') treeContainerArea.innerHTML = '';
        showToast("✨ Novo projeto em branco!");
    });

    document.getElementById('menu-salvar').addEventListener('click', () => {
        if(menuArquivoDropdown) menuArquivoDropdown.classList.remove('show');
        window.salvarProjetoNaNuvem();
    });

    document.getElementById('menu-compartilhar').addEventListener('click', async () => {
        if(menuArquivoDropdown) menuArquivoDropdown.classList.remove('show');
        if (!currentProjectId) return alert("Salve este projeto na nuvem antes de gerar um link!");
        if (hasUnsavedChanges) return alert("Você tem alterações não salvas! Salve antes de compartilhar o link.");
        
        const linkMagico = window.location.origin + window.location.pathname + '?id=' + currentProjectId;
        await navigator.clipboard.writeText(linkMagico);
        showToast("🔗 Link copiado! Modo leitura ativo para visitantes.");
    });

    const modalProjects = document.getElementById('modal-projects');
    const projectsList = document.getElementById('projects-list');
    const closeProjects = document.getElementById('close-projects');
    
    if (closeProjects) {
        closeProjects.addEventListener('click', () => {
            modalProjects.classList.remove('show');
        });
    }

    document.getElementById('menu-meus-projetos').addEventListener('click', async () => {
        if(menuArquivoDropdown) menuArquivoDropdown.classList.remove('show');
        if (!currentUser) return alert("Faça login para ver seus projetos.");
        
        modalProjects.classList.add('show');
        projectsList.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 1rem;">Buscando...</p>';

        try {
            const { data, error } = await supabase.from('projetos')
                .select('id, nome, created_at')
                .eq('user_id', currentUser.id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            if (data.length === 0) return projectsList.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 1rem;">Nenhum projeto salvo.</p>';

            projectsList.innerHTML = ''; 
            data.forEach((proj) => {
                const dataFmt = new Date(proj.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
                
                const itemDiv = document.createElement('div');
                itemDiv.style.cssText = 'display: flex; gap: 8px; margin-bottom: 8px;';

                const btn = document.createElement('button');
                btn.className = 'btn btn-outline';
                btn.style.cssText = 'flex-grow: 1; justify-content: space-between; text-align: left; padding: 12px;';
                btn.innerHTML = `
                    <span style="font-weight: 600;"><i data-lucide="cloud" class="icon-sm"></i> ${proj.nome || 'Sem nome'}</span>
                    <span style="font-size: 0.8rem; color: var(--text-secondary);">${dataFmt}</span>
                `;
                btn.addEventListener('click', () => {
                    if (hasUnsavedChanges && !confirm("Descartar alterações não salvas e abrir este projeto?")) return;
                    window.location.href = `?id=${proj.id}`;
                });

                const btnDel = document.createElement('button');
                btnDel.className = 'btn btn-outline';
                btnDel.style.cssText = 'padding: 12px; color: var(--danger-color); border-color: var(--border-color);';
                btnDel.innerHTML = `<i data-lucide="trash-2" class="icon-sm" style="margin: 0;"></i>`;
                btnDel.title = "Excluir projeto";
                
                btnDel.addEventListener('click', async (e) => {
                    e.stopPropagation(); 
                    const action = await showCustomConfirm(
                        "Atenção: Exclusão Permanente",
                        `Você está prestes a excluir "${proj.nome}". Esta ação não pode ser desfeita. O que deseja fazer?`,
                        [
                            { label: "Cancelar", value: "cancel", class: "btn-outline" },
                            { label: "Baixar TXT e Excluir", value: "backup", class: "btn-primary" },
                            { label: "Excluir sem backup", value: "delete", class: "btn-danger" }
                        ]
                    );

                    if (!action || action === "cancel") return;

                    try {
                        if (action === "backup") {
                            const { data: projBackup, error: errBackup } = await supabase.from('projetos').select('conteudo').eq('id', proj.id).single();
                            if (errBackup) throw errBackup;
                            
                            const nomeArquivo = `${proj.nome || 'backup'}.txt`;
                            const conteudoTXT = projBackup.conteudo;
                            const blobTXT = new Blob([conteudoTXT], { type: 'text/plain;charset=utf-8' });

                            // Chama a janela de salvar aqui, na hora!
                            const hndl = await getFileHandle(nomeArquivo, {'text/plain': ['.txt']}, 'Arquivo de Texto');
                            await writeBlobToFile(blobTXT, hndl, nomeArquivo);
                        }

                        const { error: errDel } = await supabase.from('projetos').delete().eq('id', proj.id);
                        if (errDel) throw errDel;

                        itemDiv.remove();
                        showToast("🗑️ Projeto excluído da nuvem!");

                        if (currentProjectId === proj.id) {
                            editor.value = '';
                            currentProjectId = null;
                            updateProjectUI("Sem Título");
                            setUnsavedState(false);
                            const urlLimpa = window.location.origin + window.location.pathname;
                            window.history.pushState({ path: urlLimpa }, '', urlLimpa);
                            updateTree();
                        }

                        if (projectsList.children.length === 0) {
                            projectsList.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 1rem;">Nenhum projeto salvo.</p>';
                        }
                    } catch (err) {
                        console.error("Erro na exclusão:", err);
                        alert("Ocorreu um erro ao excluir o projeto.");
                    }
                });

                itemDiv.appendChild(btn);
                itemDiv.appendChild(btnDel);
                projectsList.appendChild(itemDiv);
            });
            if (typeof lucide !== 'undefined') lucide.createIcons();
        } catch (err) {
            projectsList.innerHTML = '<p style="text-align: center; color: var(--danger-color); padding: 1rem;">Erro ao carregar.</p>';
        }
    });

    document.getElementById('menu-renomear').addEventListener('click', async () => {
        if(menuArquivoDropdown) menuArquivoDropdown.classList.remove('show');
        if (!currentProjectId || !currentUser) return;
        
        const novoNome = prompt("Renomear projeto para:", currentProjectName);
        if (novoNome && novoNome.trim() !== "" && novoNome !== currentProjectName) {
            try {
                const { error } = await supabase.from('projetos').update({ nome: novoNome.trim() }).eq('id', currentProjectId);
                if (error) throw error;
                
                updateProjectUI(novoNome.trim());
                showToast("📝 Projeto renomeado!");
            } catch (err) {
                console.error("Erro ao renomear:", err);
                alert("Erro ao renomear o projeto.");
            }
        }
    });

    document.getElementById('menu-fechar').addEventListener('click', () => {
        if(menuArquivoDropdown) menuArquivoDropdown.classList.remove('show');
        if (hasUnsavedChanges && !confirm("Existem alterações não salvas. Deseja fechar mesmo assim?")) return;
        
        clearTimeout(autosaveTimeout);
        editor.value = '';
        currentProjectId = null;
        updateProjectUI("Sem Título");
        setUnsavedState(false);
        const urlLimpa = window.location.origin + window.location.pathname;
        window.history.pushState({ path: urlLimpa }, '', urlLimpa);
        
        updateTree();
        const treeContainerArea = document.querySelector('.tree-content-area');
        if (treeContainerArea) treeContainerArea.innerHTML = '';
        showToast("Projeto fechado.");
    });

    document.getElementById('menu-sair-app').addEventListener('click', () => {
        if(menuArquivoDropdown) menuArquivoDropdown.classList.remove('show');
        if (hasUnsavedChanges && !confirm("Você tem alterações não salvas. Deseja sair da aplicação mesmo assim?")) return;
        alert("Pode fechar esta aba do navegador de forma segura! 👋");
    });

    const modalSobre = document.getElementById('modal-sobre');
    document.getElementById('menu-sobre').addEventListener('click', () => {
        if(menuArquivoDropdown) menuArquivoDropdown.classList.remove('show');
        modalSobre.classList.add('show');
    });
    const closeSobre = document.getElementById('close-sobre');
    if (closeSobre) closeSobre.addEventListener('click', () => { modalSobre.classList.remove('show'); });

    // ==========================================
    // --- INICIALIZAÇÃO E CARREGAMENTO ---
    // ==========================================
    async function carregarProjetoDaNuvem() {
        const urlParams = new URLSearchParams(window.location.search);
        const projetoId = urlParams.get('id');

        if (projetoId && window.supabase) {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                const usuarioLogado = session ? session.user : null;

                const { data, error } = await supabase.from('projetos').select('*').eq('id', projetoId).single();
                if (error) throw error;

                if (data && data.conteudo) {
                    editor.value = data.conteudo;
                    currentProjectId = data.id;
                    updateProjectUI(data.nome);
                    updateTree();
                    setUnsavedState(false);
                    
                    if (usuarioLogado && data.user_id === usuarioLogado.id) {
                        showToast(`☁️ Editando: ${data.nome || 'Projeto'}`);
                    } else {
                        document.body.classList.add('view-only-mode');
                        const allItems = document.querySelectorAll('.tree-item');
                        allItems.forEach(item => item.setAttribute('draggable', 'false'));
                        showToast("👀 Modo Visualização");
                    }
                }
            } catch (err) {
                showToast("❌ Projeto não encontrado.");
            }
        }
    }

    carregarProjetoDaNuvem().then(() => {
        const urlParams = new URLSearchParams(window.location.search);
        if (!urlParams.has('id') && editor.value.trim() === '') {
            const savedData = localStorage.getItem(AUTOSAVE_KEY);
            if (savedData !== null && savedData.trim() !== '') {
                editor.value = savedData;
                updateTree();
                setUnsavedState(true);
            }
        }
        saveHistoryState();
    });
});