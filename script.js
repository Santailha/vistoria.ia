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
                for (let i = 1; i <= numPages; i++) {
                    pagePromises.push(
                        pdf.getPage(i).then(page => page.getTextContent())
                        .then(textContent => textContent.items.map(item => item.str).join(' '))
                    );
                }
                Promise.all(pagePromises).then(pageTexts => resolve(pageTexts.join('\n\n')));
            }).catch(reject);
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
};

/**
 * Limpa o texto extraído do PDF, removendo cabeçalhos, rodapés e outros ruídos.
 * @param {string} rawText O texto bruto extraído do PDF.
 * @returns {string} O texto limpo e pronto para ser enviado à IA.
 */
const cleanExtractedText = (rawText) => {
    // Expressões regulares para identificar e remover linhas indesejadas
    const patternsToRemove = [
        /PVLE\.\d{3}\.\d{6}\s-\sVersão\s\d\.\d/g, // Remove a linha do código do laudo, ex: PVLE.007.853883 - Versão 1.0
        /\$\w+_\d+\$/g, // Remove placeholders como $INITIAL_1$
        /Rub\d+/g, // Remove placeholders como Rub01, Rub02...
        /^\s*\d+\s*\/\s*\d+\s*$/gm, // Remove linhas que contêm apenas a paginação (ex: " 1 / 28 ")
        /Assinaturas[\s\S]*/g // Remove o bloco de assinaturas do final
    ];

    let cleanedText = rawText;
    patternsToRemove.forEach(pattern => {
        cleanedText = cleanedText.replace(pattern, '');
    });

    // Remove linhas em branco excessivas, deixando no máximo uma.
    cleanedText = cleanedText.replace(/(\r\n|\n|\r){2,}/g, '\n\n');

    return cleanedText.trim();
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
pdfEntradaInput.addEventListener('change', () => updateFileName(pdfEntradaInput, filenameEntrada));
pdfSaidaInput.addEventListener('change', () => updateFileName(pdfSaidaInput, filenameSaida));

form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const webhookURL = 'https://hook.us2.make.com/rnqg54xd3dkkj5axtlr2cwi45do9nv5s';

    const fileEntrada = pdfEntradaInput.files[0];
    const fileSaida = pdfSaidaInput.files[0];

    if (!fileEntrada || !fileSaida) {
        alert('Por favor, selecione os dois arquivos PDF de vistoria.');
        return;
    }

    setLoadingState(true, 'Lendo PDFs...');
    resultadoContainer.classList.add('hidden');

    try {
        const [rawTextoEntrada, rawTextoSaida] = await Promise.all([
            getTextFromPdf(fileEntrada),
            getTextFromPdf(fileSaida)
        ]);
        
        setLoadingState(true, 'Limpando textos...');

        // Limpa os textos extraídos antes de enviar
        const textoEntrada = cleanExtractedText(rawTextoEntrada);
        const textoSaida = cleanExtractedText(rawTextoSaida);

        console.log("--- TEXTO LIMPO (ENTRADA) ---", textoEntrada); // Para depuração
        console.log("--- TEXTO LIMPO (SAÍDA) ---", textoSaida); // Para depuração

        setLoadingState(true, 'Analisando...');

        const response = await fetch(webhookURL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                entrada: textoEntrada,
                saida: textoSaida
            })
        });

        console.log('Resposta do Servidor Recebida!');
        console.log(`Status: ${response.status} - ${response.statusText}`);
        
        const responseBody = await response.text();
        console.log('Corpo da Resposta (texto puro):', responseBody);

        if (!response.ok) {
            throw new Error(`O servidor respondeu com um erro ${response.status}. Corpo da resposta: ${responseBody}`);
        }
        
        resultadoDiv.innerHTML = marked.parse(responseBody);
        resultadoContainer.classList.remove('hidden');

    } catch (error) {
        console.error('Ocorreu um erro no processo de análise:', error);
        resultadoDiv.innerHTML = `<p class="text-red-500 text-center"><b>Falha na Análise.</b><br>Ocorreu um erro ao processar sua solicitação. Abra o console (F12) para ver os detalhes técnicos.</p>`;
        resultadoContainer.classList.remove('hidden');
    } finally {
        setLoadingState(false);
    }
});
