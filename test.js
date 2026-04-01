
        window.updateFileName = function() {
            var fileInput = document.getElementById('fileInput');
            var fileNameDisplay = document.getElementById('fileName');
            if (fileInput.files.length > 0) {
                fileNameDisplay.innerText = fileInput.files[0].name;
                document.getElementById('inputText').placeholder = "Document selected for summary...";
                document.getElementById('inputText').value = ""; // Clear text if a file is chosen
            } else {
                fileNameDisplay.innerText = "No file chosen (.txt, .pdf, .docx)";
                document.getElementById('inputText').placeholder = "Paste your text here or upload a document below to get a concise summary...";
            }
        };

        window.summarizeText = async function() {
            var text = document.getElementById('inputText').value;
            var fileInput = document.getElementById('fileInput');
            var summarizeBtn = document.getElementById('summarizeBtn');
            var loader = document.getElementById('loader');
            var resultBox = document.getElementById('resultBox');
            var summaryText = document.getElementById('summaryText');
            var generatingBadge = document.getElementById('generatingBadge');

            if (!text.trim() && fileInput.files.length === 0) {
                alert('Please enter some text or upload a document to summarize!');
                return;
            }

            // UI loading state Update
            summarizeBtn.disabled = true;
            summaryText.classList.remove('placeholder');
            summaryText.innerHTML = '';
            loader.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Initializing link...';
            loader.style.display = 'block';
            generatingBadge.style.display = 'none';
            
            // Reset to processing colors
            resultBox.style.borderLeftColor = '#ffea00';
            resultBox.style.borderColor = '#ffea00';
            resultBox.querySelector('h3').style.color = '#ffea00';
            resultBox.querySelector('h3').style.textShadow = '0 0 8px rgba(255, 234, 0, 0.6)';
            resultBox.querySelector('h3').innerText = 'Processing...';

            try {
                let bodyData;
                let fetchOptions = { method: 'POST' };

                if (fileInput.files.length > 0) {
                    // Create FormData for file upload
                    const formData = new FormData();
                    formData.append('file', fileInput.files[0]);
                    
                    fetchOptions.body = formData;
                } else {
                    // Send plain JSON for pasted text
                    fetchOptions.headers = { 'Content-Type': 'application/json' };
                    fetchOptions.body = JSON.stringify({ text: text });
                }

                const response = await fetch('/summarize', fetchOptions);

                loader.style.display = 'none';

                if (response.ok) {
                    // It's a text stream! Set up UI for success
                    generatingBadge.style.display = 'block';
                    summaryText.style.color = 'rgba(57, 255, 20, 0.9)';
                    resultBox.style.borderColor = '#39ff14';
                    resultBox.style.borderLeftColor = '#39ff14';
                    resultBox.querySelector('h3').style.color = '#39ff14';
                    resultBox.querySelector('h3').style.textShadow = '0 0 8px rgba(57, 255, 20, 0.6)';
                    resultBox.querySelector('h3').innerText = 'Output Stream';
                    
                    // Read the stream chunk by chunk
                    const reader = response.body.getReader();
                    const decoder = new TextDecoder('utf-8');
                    let done = false;
                    let fullText = "";

                    while (!done) {
                        const { value, done: readerDone } = await reader.read();
                        done = readerDone;
                        if (value) {
                            const chunk = decoder.decode(value, { stream: true });
                            fullText += chunk;
                            summaryText.innerHTML = marked.parse(fullText);
                            
                            // Auto-scroll to bottom of the summary
                            summaryText.scrollTop = summaryText.scrollHeight;
                        }
                    }
                    
                    // Hide badge when finished
                    generatingBadge.style.display = 'none';
                } else {
                    // Handle JSON errors (like 400 Bad Request if no text)
                    const data = await response.json();
                    summaryText.innerText = 'Error: ' + data.error;
                    summaryText.style.color = '#ff003c';
                    resultBox.style.borderColor = '#ff003c';
                    resultBox.style.borderLeftColor = '#ff003c';
                    resultBox.querySelector('h3').style.color = '#ff003c';
                    resultBox.querySelector('h3').style.textShadow = '0 0 8px rgba(255, 0, 60, 0.6)';
                    resultBox.querySelector('h3').innerText = 'System Failure';
                }
            } catch (error) {
                loader.style.display = 'none';
                summaryText.innerText = 'Network error occurred: ' + error.message;
                summaryText.style.color = '#ff003c';
                resultBox.style.borderColor = '#ff003c';
                resultBox.style.borderLeftColor = '#ff003c';
                resultBox.querySelector('h3').style.color = '#ff003c';
                resultBox.querySelector('h3').style.textShadow = '0 0 8px rgba(255, 0, 60, 0.6)';
                resultBox.querySelector('h3').innerText = 'Connection Lost';
            } finally {
                summarizeBtn.disabled = false;
            }
        }
    