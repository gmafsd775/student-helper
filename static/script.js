document.addEventListener('DOMContentLoaded', function() {
    // Elements
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const selectFileBtn = document.getElementById('selectFileBtn');
    const fileInfo = document.getElementById('fileInfo');
    const fileName = document.getElementById('fileName');
    const fileProcessing = document.getElementById('fileProcessing');
    const uploadProgress = document.getElementById('uploadProgress');
    const uploadStatus = document.getElementById('uploadStatus');
    const extractedText = document.getElementById('extractedText');
    const summaryContent = document.getElementById('summaryContent');
    const qaContent = document.getElementById('qaContent');
    const urduContent = document.getElementById('urduContent');
    const mcqContainer = document.getElementById('mcqContainer');
    const processingMCQ = document.getElementById('processingMCQ');
    const submitQuizBtn = document.getElementById('submitQuizBtn');
    const scoreContainer = document.getElementById('scoreContainer');
    const scoreValue = document.getElementById('scoreValue');
    const totalQuestions = document.getElementById('totalQuestions');
    const answerReview = document.getElementById('answerReview');
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    const notification = document.getElementById('notification');
    const notificationTitle = document.getElementById('notificationTitle');
    const notificationMessage = document.getElementById('notificationMessage');
    
    // Variables to store data
    let extractedTextData = '';
    let mcqQuestions = [];
    
    // Event Listeners
    selectFileBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileUpload);
    submitQuizBtn.addEventListener('click', evaluateQuiz);
    
    // Tab navigation
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');
            
            // Update active tab button
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Update active tab content
            tabContents.forEach(content => content.classList.remove('active'));
            document.getElementById(tabId).classList.add('active');
        });
    });
    
    // Drag and drop functionality
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    
    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });
    
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        
        if (e.dataTransfer.files.length) {
            fileInput.files = e.dataTransfer.files;
            handleFileUpload();
        }
    });
    
    // Show notification
    function showNotification(title, message, isSuccess = true) {
        notificationTitle.textContent = title;
        notificationMessage.textContent = message;
        
        const icon = notification.querySelector('i');
        icon.className = isSuccess ? 'fas fa-check-circle' : 'fas fa-exclamation-circle';
        notification.className = `notification ${isSuccess ? 'success' : 'error'}`;
        
        notification.classList.add('show');
        
        setTimeout(() => {
            notification.classList.remove('show');
        }, 3000);
    }
    
    // File upload handler
    function handleFileUpload() {
        const file = fileInput.files[0];
        if (!file) return;
        
        // Check file type
        const fileType = file.type;
        const validTypes = ['image/jpeg', 'image/png', 'application/pdf'];
        
        if (!validTypes.includes(fileType)) {
            showNotification('Error', 'Please upload a JPG, PNG, or PDF file.', false);
            return;
        }
        
        // Show file info
        fileName.textContent = file.name;
        fileInfo.style.display = 'flex';
        
        // Show processing indicator
        fileProcessing.style.display = 'flex';
        dropZone.style.display = 'none';
        
        // Simulate progress
        let progress = 0;
        const progressInterval = setInterval(() => {
            progress += 5;
            uploadProgress.style.width = `${progress}%`;
            
            if (progress === 25) {
                uploadStatus.textContent = "Sending to Azure OCR...";
            } else if (progress === 50) {
                uploadStatus.textContent = "Extracting text...";
            } else if (progress === 75) {
                uploadStatus.textContent = "Processing with Azure AI...";
            }
            
            if (progress >= 100) {
                clearInterval(progressInterval);
                processFileWithAzure(file);
            }
        }, 200);
    }
    
    // Process file with Azure services
    function processFileWithAzure(file) {
        // Create FormData for file upload
        const formData = new FormData();
        formData.append('file', file);
        
        // Send file to server for processing
        fetch('/upload', {
            method: 'POST',
            body: formData
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Server error: ' + response.status);
            }
            return response.json();
        })
        .then(data => {
            fileProcessing.style.display = 'none';
            dropZone.style.display = 'block';
            
            if (data.success) {
                // Display extracted text
                extractedTextData = data.extracted_text;
                extractedText.textContent = extractedTextData;
                
                // Display summary
                summaryContent.textContent = data.summary;
                
                // Display Q&A
                qaContent.textContent = data.qa;
                
                // Display Urdu translation
                urduContent.innerHTML = `<p class="urdu-text">${data.urdu_text}</p>`;
                
                // Generate MCQs from server response
                processMCQs(data.mcqs);
                
                showNotification('Success', 'File processed successfully!');
            } else {
                showNotification('Error', data.error || 'Unknown error occurred', false);
            }
        })
        .catch(error => {
            fileProcessing.style.display = 'none';
            dropZone.style.display = 'block';
            console.error('Error:', error);
            showNotification('Error', 'An error occurred while processing the file.', false);
        });
    }
    
    // Process MCQs from server response
    function processMCQs(mcqText) {
        processingMCQ.style.display = 'flex';
        mcqContainer.style.display = 'none';
        
        // Parse the MCQ text
        try {
            const lines = mcqText.split('\n');
            mcqQuestions = [];
            let currentQuestion = null;
            
            for (const line of lines) {
                if (line.startsWith('Q: ')) {
                    if (currentQuestion) {
                        mcqQuestions.push(currentQuestion);
                    }
                    currentQuestion = {
                        question: line.substring(3).trim(),
                        options: [],
                        correctIndex: -1
                    };
                } else if (line.match(/^[A-D]\.\s/)) {
                    if (currentQuestion) {
                        currentQuestion.options.push(line.substring(3).trim());
                    }
                } else if (line.startsWith('Answer: ')) {
                    if (currentQuestion) {
                        const answerLetter = line.substring(8).trim().toUpperCase();
                        currentQuestion.correctIndex = answerLetter.charCodeAt(0) - 65; // A=0, B=1, etc.
                    }
                }
            }
            
            if (currentQuestion) {
                mcqQuestions.push(currentQuestion);
            }
            
            // Render MCQs
            renderMCQs();
            
        } catch (error) {
            console.error('Error parsing MCQs:', error);
            mcqContainer.innerHTML = '<p>Error generating MCQs. Please try again.</p>';
        }
        
        processingMCQ.style.display = 'none';
        mcqContainer.style.display = 'block';
        submitQuizBtn.style.display = 'block';
        scoreContainer.style.display = 'none';
    }
    
    // Render MCQs to the page
    function renderMCQs() {
        mcqContainer.innerHTML = '';
        
        if (mcqQuestions.length === 0) {
            mcqContainer.innerHTML = '<p>No MCQs could be generated from the content.</p>';
            return;
        }
        
        mcqQuestions.forEach((q, qIndex) => {
            const questionDiv = document.createElement('div');
            questionDiv.classList.add('mcq-question');
            questionDiv.innerHTML = `
                <h4>${qIndex + 1}. ${q.question}</h4>
                <div class="mcq-options">
                    ${q.options.map((opt, optIndex) => `
                        <div class="mcq-option">
                            <input type="radio" name="q${qIndex}" id="q${qIndex}o${optIndex}" value="${optIndex}">
                            <label for="q${qIndex}o${optIndex}">${String.fromCharCode(65 + optIndex)}. ${opt}</label>
                        </div>
                    `).join('')}
                </div>
            `;
            mcqContainer.appendChild(questionDiv);
        });
    }
    
    // Evaluate quiz answers
    function evaluateQuiz() {
        let score = 0;
        let reviewHTML = '';
        
        mcqQuestions.forEach((q, qIndex) => {
            const selectedOption = document.querySelector(`input[name="q${qIndex}"]:checked`);
            const userAnswer = selectedOption ? parseInt(selectedOption.value) : -1;
            const isCorrect = userAnswer === q.correctIndex;
            
            if (isCorrect) score++;
            
            reviewHTML += `
                <div class="qa-item">
                    <div class="qa-question">${qIndex + 1}. ${q.question}</div>
                    <div class="${isCorrect ? 'correct' : 'incorrect'}">
                        Your answer: ${userAnswer !== -1 ? String.fromCharCode(65 + userAnswer) + '. ' + q.options[userAnswer] : 'Not answered'}
                    </div>
                    ${!isCorrect ? `
                        <div class="correct">Correct answer: ${String.fromCharCode(65 + q.correctIndex)}. ${q.options[q.correctIndex]}</div>
                    ` : ''}
                </div>
            `;
        });
        
        scoreValue.textContent = score;
        totalQuestions.textContent = mcqQuestions.length;
        answerReview.innerHTML = reviewHTML;
        scoreContainer.style.display = 'block';
        submitQuizBtn.style.display = 'none';
        
        // Scroll to results
        scoreContainer.scrollIntoView({ behavior: 'smooth' });
        
        // Show score notification
        const percentage = (score / mcqQuestions.length) * 100;
        let message;
        if (percentage >= 80) {
            message = 'Excellent work!';
        } else if (percentage >= 60) {
            message = 'Good job!';
        } else {
            message = 'Keep practicing!';
        }
        
        showNotification('Quiz Completed', `You scored ${score}/${mcqQuestions.length}. ${message}`);
    }
});