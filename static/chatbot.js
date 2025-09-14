document.addEventListener('DOMContentLoaded', function() {
    const chatMessages = document.getElementById('chatMessages');
    const chatInput = document.getElementById('chatInput');
    const sendMessageBtn = document.getElementById('sendMessageBtn');
    
    // Event listeners
    sendMessageBtn.addEventListener('click', sendChatMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendChatMessage();
    });
    
    // Send chat message
    function sendChatMessage() {
        const message = chatInput.value.trim();
        if (!message) return;
        
        // Add user message to chat
        addMessageToChat(message, 'user');
        chatInput.value = '';
        
        // Send message to server
        fetch('/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: message,
                extracted_text: window.extractedTextData || ''
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.response) {
                addMessageToChat(data.response, 'bot');
            } else {
                addMessageToChat("I'm sorry, I couldn't process your request. Please try again.", 'bot');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            addMessageToChat("I'm experiencing technical difficulties. Please try again later.", 'bot');
        });
    }
    
    // Add message to chat
    function addMessageToChat(message, sender) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message');
        messageDiv.classList.add(sender === 'user' ? 'user-message' : 'bot-message');
        messageDiv.textContent = message;
        
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
});