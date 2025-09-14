import os
import requests
from flask import Flask, render_template, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename
from dotenv import load_dotenv
import json
import base64
from flask_cors import CORS
import time

# Load environment variables
load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv('FLASK_SECRET_KEY', 'myflasksecret123')
CORS(app)  # Enable CORS for all routes

# Configuration
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'pdf'}

# Azure Configuration
AZURE_OCR_KEY = os.getenv('AZURE_OCR_KEY')
AZURE_OCR_ENDPOINT = os.getenv('AZURE_OCR_ENDPOINT')
AZURE_OPENAI_KEY = os.getenv('AZURE_OPENAI_API_KEY')
AZURE_OPENAI_ENDPOINT = os.getenv('AZURE_OPENAI_ENDPOINT')
AZURE_OPENAI_DEPLOYMENT = os.getenv('AZURE_OPENAI_DEPLOYMENT')
AZURE_TRANSLATOR_KEY = os.getenv('AZURE_TRANSLATOR_KEY')
AZURE_TRANSLATOR_ENDPOINT = os.getenv('AZURE_TRANSLATOR_ENDPOINT')
AZURE_TRANSLATOR_REGION = os.getenv('AZURE_TRANSLATOR_REGION')

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def extract_text_with_azure_ocr(file_path, is_pdf=False):
    """Extract text from image or PDF using Azure OCR"""
    try:
        # Read the file
        with open(file_path, 'rb') as f:
            file_data = f.read()
        
        # Set up the request
        headers = {
            'Ocp-Apim-Subscription-Key': AZURE_OCR_KEY,
            'Content-Type': 'application/octet-stream'
        }
        
        params = {
            'language': 'en',
            'detectOrientation': 'true'
        }
        
        # Use the Read API for better PDF support
        endpoint_url = f"{AZURE_OCR_ENDPOINT}/vision/v3.2/read/analyze"
        
        if is_pdf:
            # For PDFs, we need to use a different approach
            endpoint_url = f"{AZURE_OCR_ENDPOINT}/vision/v3.2/read/analyze"
            headers['Content-Type'] = 'application/octet-stream'
        
        # Make the request to Azure OCR API
        response = requests.post(
            endpoint_url,
            headers=headers,
            params=params,
            data=file_data
        )
        
        # Check if the request was accepted
        if response.status_code == 202:
            # Get the operation location URL
            operation_location = response.headers['Operation-Location']
            
            # Wait for the operation to complete
            while True:
                time.sleep(1)  # Wait 1 second before checking status
                status_response = requests.get(operation_location, headers=headers)
                status_response.raise_for_status()
                status_data = status_response.json()
                
                if status_data['status'] == 'succeeded':
                    # Extract text from the result
                    extracted_text = ""
                    if 'analyzeResult' in status_data and 'readResults' in status_data['analyzeResult']:
                        for read_result in status_data['analyzeResult']['readResults']:
                            for line in read_result['lines']:
                                extracted_text += line['text'] + "\n"
                    return extracted_text.strip()
                elif status_data['status'] == 'failed':
                    raise Exception("Azure OCR processing failed")
        else:
            response.raise_for_status()
            # For simple image OCR (non-async)
            result = response.json()
            extracted_text = ""
            if 'regions' in result:
                for region in result['regions']:
                    for line in region['lines']:
                        for word in line['words']:
                            extracted_text += word['text'] + " "
                        extracted_text += "\n"
                    extracted_text += "\n"
            return extracted_text.strip()
    
    except Exception as e:
        print(f"Error in OCR: {str(e)}")
        return None

def call_azure_openai(prompt, max_tokens=500):
    """Call Azure OpenAI API"""
    try:
        url = f"{AZURE_OPENAI_ENDPOINT}/openai/deployments/{AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version=2023-05-15"
        
        headers = {
            "Content-Type": "application/json",
            "api-key": AZURE_OPENAI_KEY
        }
        
        data = {
            "messages": [
                {"role": "system", "content": "You are a helpful study assistant."},
                {"role": "user", "content": prompt}
            ],
            "max_tokens": max_tokens,
            "temperature": 0.7
        }
        
        response = requests.post(url, headers=headers, json=data)
        response.raise_for_status()
        result = response.json()
        
        return result['choices'][0]['message']['content']
    
    except Exception as e:
        print(f"Error calling Azure OpenAI: {str(e)}")
        return None

def generate_summary(text):
    """Generate summary using Azure OpenAI"""
    prompt = f"Please provide a concise summary of the following text:\n\n{text}"
    return call_azure_openai(prompt)

def generate_qa(text):
    """Generate Q&A using Azure OpenAI"""
    prompt = f"Create 3-5 question and answer pairs based on the following text. Format each as 'Q: question\nA: answer':\n\n{text}"
    return call_azure_openai(prompt)

def generate_mcqs(text):
    """Generate MCQs using Azure OpenAI"""
    prompt = f"Create 5 multiple choice questions based on the following text. Format each question as follows:\n\nQ: question\nA. option1\nB. option2\nC. option3\nD. option4\nAnswer: correct_letter\n\nText:\n{text}"
    return call_azure_openai(prompt, max_tokens=800)

def translate_text(text, target_language='ur'):
    """Translate text using Azure Translator"""
    try:
        url = f"{AZURE_TRANSLATOR_ENDPOINT}/translate?api-version=3.0&to={target_language}"
        
        headers = {
            'Ocp-Apim-Subscription-Key': AZURE_TRANSLATOR_KEY,
            'Ocp-Apim-Subscription-Region': AZURE_TRANSLATOR_REGION,
            'Content-Type': 'application/json'
        }
        
        body = [{'text': text}]
        
        response = requests.post(url, headers=headers, json=body)
        response.raise_for_status()
        result = response.json()
        
        return result[0]['translations'][0]['text']
    
    except Exception as e:
        print(f"Error in translation: {str(e)}")
        return text

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/static/<path:path>')
def send_static(path):
    return send_from_directory('static', path)

@app.route('/upload', methods=['POST'])
def upload_file():
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file uploaded'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        if file and allowed_file(file.filename):
            filename = secure_filename(file.filename)
            file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            
            # Create upload directory if it doesn't exist
            if not os.path.exists(app.config['UPLOAD_FOLDER']):
                os.makedirs(app.config['UPLOAD_FOLDER'])
                
            file.save(file_path)
            
            # Extract text based on file type
            file_extension = filename.rsplit('.', 1)[1].lower()
            is_pdf = file_extension == 'pdf'
            
            # Use Azure OCR for text extraction
            extracted_text = extract_text_with_azure_ocr(file_path, is_pdf)
            
            # If Azure OCR fails, try a fallback method
            if not extracted_text:
                # For PDFs, you might need a different approach
                if is_pdf:
                    try:
                        # Try using a PDF text extraction library as fallback
                        import PyPDF2
                        with open(file_path, 'rb') as f:
                            pdf_reader = PyPDF2.PdfReader(f)
                            extracted_text = ""
                            for page in pdf_reader.pages:
                                extracted_text += page.extract_text() + "\n"
                    except ImportError:
                        print("PyPDF2 not installed, cannot extract text from PDF")
                        extracted_text = None
                
                # If still no text, use simulation but log the error
                if not extracted_text:
                    print("Azure OCR failed and no fallback available")
                    return jsonify({
                        'success': False,
                        'error': 'Text extraction failed. Please check your Azure OCR configuration and try again.'
                    }), 500
            
            # Generate summary, Q&A, and MCQs
            summary = generate_summary(extracted_text)
            qa = generate_qa(extracted_text)
            mcqs = generate_mcqs(extracted_text)
            
            # Translate to Urdu if needed
            urdu_text = translate_text(extracted_text)
            
            return jsonify({
                'success': True,
                'extracted_text': extracted_text,
                'summary': summary,
                'qa': qa,
                'mcqs': mcqs,
                'urdu_text': urdu_text
            })
        
        return jsonify({'error': 'Invalid file type'}), 400
        
    except Exception as e:
        print(f"Server error: {str(e)}")
        return jsonify({'error': f'Internal server error: {str(e)}'}), 500

@app.route('/chat', methods=['POST'])
def chat():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
            
        user_message = data.get('message', '')
        extracted_text = data.get('extracted_text', '')
        
        if not user_message:
            return jsonify({'error': 'No message provided'}), 400
        
        # Use Azure OpenAI for chat responses
        prompt = f"Based on the following text: {extracted_text[:1000]}...\n\nUser question: {user_message}\n\nPlease provide a helpful response:"
        response = call_azure_openai(prompt)
        
        if not response:
            response = "I'm sorry, I couldn't process your request at the moment. Please try again later."
        
        return jsonify({'response': response})
        
    except Exception as e:
        print(f"Chat error: {str(e)}")
        return jsonify({'error': f'Internal server error: {str(e)}'}), 500

if __name__ == '__main__':
    # Create upload directory if it doesn't exist
    if not os.path.exists(app.config['UPLOAD_FOLDER']):
        os.makedirs(app.config['UPLOAD_FOLDER'])
    
    app.run(debug=True, port=5000)