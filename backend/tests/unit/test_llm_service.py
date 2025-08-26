"""Unit tests for LLMService."""

import pytest
import json
from unittest.mock import MagicMock, patch
from app.services.llm_service import LLMService


class TestLLMService:
    """Test suite for LLMService."""

    @pytest.fixture
    def mock_openai_client(self):
        """Create a mock OpenAI client."""
        client = MagicMock()
        mock_response = MagicMock()
        mock_response.choices = [
            MagicMock(message=MagicMock(content="Test response"))
        ]
        client.chat.completions.create.return_value = mock_response
        return client

    @pytest.fixture
    def llm_service_with_client(self, mock_openai_client):
        """Create LLMService with mocked client."""
        service = LLMService()
        service.client = mock_openai_client
        service.model = "gpt-4"
        return service

    @pytest.mark.asyncio
    async def test_enhance_note_with_client(self, llm_service_with_client):
        """Test enhancing a note with configured client."""
        context = {
            "noteContent": "This is a test note"
        }
        
        result = await llm_service_with_client.enhance_note("Summarize this", context)
        
        assert "response" in result
        assert result["response"] == "Test response"
        llm_service_with_client.client.chat.completions.create.assert_called_once()

    @pytest.mark.asyncio
    async def test_enhance_note_without_client(self):
        """Test enhancing a note without configured client."""
        service = LLMService()
        service.client = None
        
        context = {"noteContent": "Test note"}
        result = await service.enhance_note("Summarize", context)
        
        assert "response" in result
        assert "not configured" in result["response"]

    @pytest.mark.asyncio
    async def test_enhance_note_error_handling(self, llm_service_with_client):
        """Test error handling in enhance_note."""
        llm_service_with_client.client.chat.completions.create.side_effect = Exception("API Error")
        
        context = {"noteContent": "Test note"}
        result = await llm_service_with_client.enhance_note("Summarize", context)
        
        assert "response" in result
        assert "Error processing request" in result["response"]

    @pytest.mark.asyncio
    async def test_process_screenshot_command_with_client(self, llm_service_with_client):
        """Test processing screenshot command with configured client."""
        # Mock JSON response
        json_response = json.dumps({
            "intent": "annotate",
            "parameters": {"color": "red", "location": "top-left"}
        })
        llm_service_with_client.client.chat.completions.create.return_value.choices[0].message.content = json_response
        
        result = await llm_service_with_client.process_screenshot_command("Add red arrow to top left")
        
        assert result["intent"] == "annotate"
        assert "parameters" in result
        assert result["parameters"]["color"] == "red"

    @pytest.mark.asyncio
    async def test_process_screenshot_command_with_ocr(self, llm_service_with_client):
        """Test processing screenshot command with OCR text."""
        json_response = json.dumps({
            "intent": "extract_text",
            "parameters": {"text": "extracted"}
        })
        llm_service_with_client.client.chat.completions.create.return_value.choices[0].message.content = json_response
        
        result = await llm_service_with_client.process_screenshot_command(
            "Extract text",
            ocr_text="Sample OCR text"
        )
        
        assert result["intent"] == "extract_text"
        
        # Verify OCR text was included in the request
        call_args = llm_service_with_client.client.chat.completions.create.call_args
        messages = call_args[1]["messages"]
        assert "OCR Text" in messages[1]["content"]

    @pytest.mark.asyncio
    async def test_process_screenshot_command_without_client(self):
        """Test processing screenshot command without configured client."""
        service = LLMService()
        service.client = None
        
        result = await service.process_screenshot_command("Test command")
        
        assert result["intent"] == "unknown"
        assert result["parameters"] == {}

    @pytest.mark.asyncio
    async def test_process_screenshot_command_error_handling(self, llm_service_with_client):
        """Test error handling in process_screenshot_command."""
        llm_service_with_client.client.chat.completions.create.side_effect = Exception("API Error")
        
        result = await llm_service_with_client.process_screenshot_command("Test command")
        
        assert result["intent"] == "unknown"
        assert result["parameters"] == {}

    @pytest.mark.asyncio
    async def test_process_general_with_client(self, llm_service_with_client):
        """Test general processing with configured client."""
        payload = {
            "prompt": "Test prompt",
            "context": {"key": "value"}
        }
        
        result = await llm_service_with_client.process_general(payload)
        
        assert "response" in result
        assert result["response"] == "Test response"

    @pytest.mark.asyncio
    async def test_process_general_without_client(self):
        """Test general processing without configured client."""
        service = LLMService()
        service.client = None
        
        payload = {"prompt": "Test"}
        result = await service.process_general(payload)
        
        assert "response" in result
        assert result["response"] == "LLM service not configured"

    @pytest.mark.asyncio
    async def test_process_general_error_handling(self, llm_service_with_client):
        """Test error handling in process_general."""
        llm_service_with_client.client.chat.completions.create.side_effect = Exception("API Error")
        
        payload = {"prompt": "Test"}
        result = await llm_service_with_client.process_general(payload)
        
        assert "response" in result
        assert "Error" in result["response"]

    def test_initialization_with_openai_key(self):
        """Test initialization with OpenAI API key."""
        with patch('app.services.llm_service.os.getenv') as mock_getenv:
            mock_getenv.side_effect = lambda key, default=None: {
                'OPENAI_API_KEY': 'test-key',
                'LLM_MODEL': 'gpt-4'
            }.get(key, default)
            
            with patch('app.services.llm_service.OpenAI') as mock_openai:
                mock_client = MagicMock()
                mock_openai.return_value = mock_client
                
                service = LLMService()
                
                assert service.api_key == 'test-key'
                assert service.model == 'gpt-4'
                assert service.client == mock_client
                mock_openai.assert_called_once_with(api_key='test-key')

    def test_initialization_with_azure_openai(self):
        """Test initialization with Azure OpenAI configuration."""
        with patch('app.services.llm_service.os.getenv') as mock_getenv:
            mock_getenv.side_effect = lambda key, default=None: {
                'AZURE_OPENAI_ENDPOINT': 'https://test.openai.azure.com',
                'AZURE_OPENAI_API_KEY': 'azure-key',
                'AZURE_OPENAI_API_VERSION': '2023-05-15',
                'AZURE_OPENAI_DEPLOYMENT': 'gpt-4-deployment'
            }.get(key, default)
            
            with patch('app.services.llm_service.AzureOpenAI') as mock_azure:
                mock_client = MagicMock()
                mock_azure.return_value = mock_client
                
                service = LLMService()
                
                assert service.model == 'gpt-4-deployment'
                assert service.client == mock_client
                mock_azure.assert_called_once()

    def test_initialization_without_api_key(self):
        """Test initialization without any API key."""
        with patch('app.services.llm_service.os.getenv') as mock_getenv:
            mock_getenv.return_value = None
            
            service = LLMService()
            
            assert service.api_key is None
            assert service.client is None
            assert service.model == 'gpt-4'  # Default model