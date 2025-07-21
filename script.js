// Configura o worker para o PDF.js. Essencial para a biblioteca funcionar.
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.worker.min.js';

// --- MAPEAMENTO DE ELEMENTOS DO DOM ---
const form = document.getElementById('form-vistoria');
const btnAnalisar = document.getElementById('btn-analisar');
const btnText = document.getElementById('btn-text');
const loadingSpinner = document.getElementById('loading-spinner');
const resultadoContainer = document.getElementById('resultado-container');
const resultadoDiv = document.getElementById('resultado');

const pdfEntradaInput = document.getElementById('pdf-entrada');
const pdfSaidaInput = document.getElementById('pdf-saida');
const filenameEntrada = document.getElementById('filename-entrada');
const filenameSaida = document.getElementById('filename-saida');

// --- FUNÇÕES ---

/**
 * Atualiza a UI para mostrar o nome do arquivo selecionado.
 * @param {HTMLInputElement} input O elemento input do tipo file.
 * @param {HTMLElement} label O elemento onde o nome do arquivo será exibido.
 */
const updateFileName = (input, label) => {
    if (input.files.length > 0) {
        label.textContent = input.files[0].name;
        label.closest('.file-input-label').classList.add('has-file');
    } else {
        label.innerHTML = `<span class="font-semibold">Clique para escolher</span> ou arraste`;
        label.closest('.file-input-label').classList.remove('has-file');
    }
};

/**
 * Extrai todo o texto de um arquivo PDF.
 * @param {File} file O arquivo PDF a ser processado.
 * @returns {Promise<string>} Uma promessa que resolve com o texto extraído do PDF.
 */
const getTextFromPdf = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(event) {
            const typedarray = new Uint8Array(event.target.result);
            pdfjsLib.getDocument(typedarray).promise.then(pdf => {
                const numPages = pdf.numPages;
                let pagePromises = [];
                // Itera por todas as páginas do PDF
                for (let i = 1; i <= numPages; i++) {
                    pagePromises.push(
                        pdf.getPage(i).then(page => {
                            return page.getTextContent();
                        }).then(textContent => {
                            // Junta todos os pedaços de texto da página
                            return textContent.items.map(item => item.str).join(' ');
                        })
                    );
                }
                // Quando todas as páginas forem processadas, junta o texto de todas elas
                Promise.all(pagePromises).then(pageTexts => {
                    resolve(pageTexts.join('\n\n'));
                });
            }).catch(reject);
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
};

/**
 * Controla o estado da UI durante o carregamento.
 * @param {boolean} isLoading Se a aplicação está carregando.
 * @param {string} [message=''] A mensagem a ser exibida no botão.
 */
const setLoadingState = (isLoading, message = '') => {
    btnAnalisar.disabled = isLoading;
    loadingSpinner.classList.toggle('hidden', !isLoading);
    if (isLoading) {
        btnText.textContent = message;
    } else {
        btnText.textContent = 'Analisar e Comparar';
    }
};

// --- EVENT LISTENERS ---

// Atualiza o nome do arquivo na UI quando um arquivo é selecionado
pdfEntradaInput.addEventListener('change', () => updateFileName(pdfEntradaInput, filenameEntrada));
pdfSaidaInput.addEventListener('change', () => updateFileName(pdfSaidaInput, filenameSaida));

// Listener principal para o envio do formulário
form.addEventListener('submit', async (event) => {
    event.preventDefault(); // Impede o recarregamento da página

    // ==================================================================
    //  IMPORTANTE: Cole a URL do seu Webhook do Make.com aqui
    // ==================================================================
    const webhookURL = 'https://hook.us2.make.com/rnqg54xd3dkkj5axtlr2cwi45do9nv5s';

    if (webhookURL === 'https://hook.us2.make.com/rnqg54xd3dkkj5axtlr2cwi45do9nv5s') {
        alert('ERRO: Você precisa configurar a URL do Webhook no arquivo script.js!');
        return;
    }

    const fileEntrada = pdfEntradaInput.files[0];
    const fileSaida = pdfSaidaInput.files[0];

    if (!fileEntrada || !fileSaida) {
        alert('Por favor, selecione os dois arquivos PDF de vistoria.');
        return;
    }

    setLoadingState(true, 'Lendo PDFs...');
    resultadoContainer.classList.add('hidden');

    try {
        // Extrai o texto dos dois arquivos em paralelo para otimizar o tempo
        const [textoEntrada, textoSaida] = await Promise.all([
            getTextFromPdf(fileEntrada),
            getTextFromPdf(fileSaida)
        ]);
        
        setLoadingState(true, 'Analisando...');

        // Envia os textos extraídos para o Webhook do Make.com
        const response = await fetch(webhookURL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                entrada: textoEntrada,
                saida: textoSaida
            })
        });

        if (!response.ok) {
            throw new Error(`Erro na comunicação com o servidor: ${response.statusText}`);
        }

        const analiseMarkdown = await response.text();
        // Usa a biblioteca 'marked' para converter a resposta (em Markdown) para HTML
        resultadoDiv.innerHTML = marked.parse(analiseMarkdown);
        resultadoContainer.classList.remove('hidden');

    } catch (error) {
        console.error('Ocorreu um erro:', error);
        resultadoDiv.innerHTML = `<p class="text-red-500 text-center"><b>Falha na Análise.</b><br>Ocorreu um erro ao processar sua solicitação. Verifique se os PDFs não estão protegidos ou corrompidos e tente novamente.</p>`;
        resultadoContainer.classList.remove('hidden');
    } finally {
        // Restaura o estado do botão
        setLoadingState(false);
    }
});
