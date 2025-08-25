"""Unit tests for LLMService."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import base64
from app.services.llm_service import LLMService


class TestLLMService:
    """Test suite for LLMService."""

    @pytest.mark.asyncio
    async def test_process_with_openai(self, llm_service):
        """Test processing with OpenAI provider."""
        # Mock OpenAI response
        mock_response = MagicMock()
        mock_response.choices = [
            MagicMock(message=MagicMock(content="OpenAI response"))
        ]
        llm_service.openai_client.chat.completions.create = AsyncMock(return_value=mock_response)
        
        result = await llm_service.process(
            prompt="Test prompt",
            provider="openai",
            model="gpt-4"
        )
        
        assert result == "OpenAI response"
        llm_service.openai_client.chat.completions.create.assert_called_once()

    @pytest.mark.asyncio
    async def test_process_with_anthropic(self, llm_service):
        """Test processing with Anthropic provider."""
        # Mock Anthropic response
        mock_response = MagicMock()
        mock_response.content = [MagicMock(text="Anthropic response")]
        llm_service.anthropic_client.messages.create = AsyncMock(return_value=mock_response)
        
        result = await llm_service.process(
            prompt="Test prompt",
            provider="anthropic",
            model="claude-3"
        )
        
        assert result == "Anthropic response"
        llm_service.anthropic_client.messages.create.assert_called_once()

    @pytest.mark.asyncio
    async def test_process_with_image_openai(self, llm_service):
        """Test processing with image using OpenAI."""
        # Mock OpenAI response
        mock_response = MagicMock()
        mock_response.choices = [
            MagicMock(message=MagicMock(content="Image analysis result"))
        ]
        llm_service.openai_client.chat.completions.create = AsyncMock(return_value=mock_response)
        
        # Create a simple base64 image
        image_data = base64.b64encode(b"fake_image_data").decode()
        
        result = await llm_service.process(
            prompt="Analyze this image",
            image=image_data,
            provider="openai",
            model="gpt-4-vision"
        )
        
        assert result == "Image analysis result"
        
        # Verify the call included image in the content
        call_args = llm_service.openai_client.chat.completions.create.call_args
        messages = call_args[1]["messages"]
        assert any("image_url" in str(msg) for msg in messages)

    @pytest.mark.asyncio
    async def test_process_with_image_anthropic(self, llm_service):
        """Test processing with image using Anthropic."""
        # Mock Anthropic response
        mock_response = MagicMock()
        mock_response.content = [MagicMock(text="Image analysis with Claude")]
        llm_service.anthropic_client.messages.create = AsyncMock(return_value=mock_response)
        
        # Create a simple base64 image
        image_data = base64.b64encode(b"fake_image_data").decode()
        
        result = await llm_service.process(
            prompt="Analyze this image",
            image=image_data,
            provider="anthropic",
            model="claude-3"
        )
        
        assert result == "Image analysis with Claude"
        
        # Verify the call included image in the messages
        call_args = llm_service.anthropic_client.messages.create.call_args
        messages = call_args[1]["messages"]
        assert any("image" in str(msg) for msg in messages)

    @pytest.mark.asyncio
    async def test_process_with_system_prompt(self, llm_service):
        """Test processing with system prompt."""
        # Mock OpenAI response
        mock_response = MagicMock()
        mock_response.choices = [
            MagicMock(message=MagicMock(content="Response with system prompt"))
        ]
        llm_service.openai_client.chat.completions.create = AsyncMock(return_value=mock_response)
        
        result = await llm_service.process(
            prompt="User prompt",
            system_prompt="You are a helpful assistant",
            provider="openai"
        )
        
        assert result == "Response with system prompt"
        
        # Verify system prompt was included
        call_args = llm_service.openai_client.chat.completions.create.call_args
        messages = call_args[1]["messages"]
        assert messages[0]["role"] == "system"
        assert messages[0]["content"] == "You are a helpful assistant"

    @pytest.mark.asyncio
    async def test_process_with_temperature(self, llm_service):
        """Test processing with custom temperature."""
        # Mock OpenAI response
        mock_response = MagicMock()
        mock_response.choices = [
            MagicMock(message=MagicMock(content="Temperature test"))
        ]
        llm_service.openai_client.chat.completions.create = AsyncMock(return_value=mock_response)
        
        result = await llm_service.process(
            prompt="Test",
            temperature=0.5,
            provider="openai"
        )
        
        assert result == "Temperature test"
        
        # Verify temperature was passed
        call_args = llm_service.openai_client.chat.completions.create.call_args
        assert call_args[1]["temperature"] == 0.5

    @pytest.mark.asyncio
    async def test_process_with_max_tokens(self, llm_service):
        """Test processing with max_tokens limit."""
        # Mock OpenAI response
        mock_response = MagicMock()
        mock_response.choices = [
            MagicMock(message=MagicMock(content="Limited response"))
        ]
        llm_service.openai_client.chat.completions.create = AsyncMock(return_value=mock_response)
        
        result = await llm_service.process(
            prompt="Test",
            max_tokens=100,
            provider="openai"
        )
        
        assert result == "Limited response"
        
        # Verify max_tokens was passed
        call_args = llm_service.openai_client.chat.completions.create.call_args
        assert call_args[1]["max_tokens"] == 100

    @pytest.mark.asyncio
    async def test_process_with_invalid_provider(self, llm_service):
        """Test processing with invalid provider."""
        with pytest.raises(ValueError, match="Unsupported provider"):
            await llm_service.process(
                prompt="Test",
                provider="invalid_provider"
            )

    @pytest.mark.asyncio
    async def test_process_openai_error_handling(self, llm_service):
        """Test error handling for OpenAI API errors."""
        llm_service.openai_client.chat.completions.create = AsyncMock(
            side_effect=Exception("API Error")
        )
        
        with pytest.raises(Exception, match="API Error"):
            await llm_service.process(
                prompt="Test",
                provider="openai"
            )

    @pytest.mark.asyncio
    async def test_process_anthropic_error_handling(self, llm_service):
        """Test error handling for Anthropic API errors."""
        llm_service.anthropic_client.messages.create = AsyncMock(
            side_effect=Exception("API Error")
        )
        
        with pytest.raises(Exception, match="API Error"):
            await llm_service.process(
                prompt="Test",
                provider="anthropic"
            )

    @pytest.mark.asyncio
    async def test_get_available_models(self, llm_service):
        """Test getting available models."""
        models = await llm_service.get_available_models()
        
        assert "openai" in models
        assert "anthropic" in models
        assert len(models["openai"]) > 0
        assert len(models["anthropic"]) > 0

    @pytest.mark.asyncio
    async def test_validate_api_keys(self, llm_service):
        """Test API key validation."""
        # Mock successful API calls
        mock_response_openai = MagicMock()
        mock_response_openai.choices = [MagicMock(message=MagicMock(content="test"))]
        llm_service.openai_client.chat.completions.create = AsyncMock(return_value=mock_response_openai)
        
        mock_response_anthropic = MagicMock()
        mock_response_anthropic.content = [MagicMock(text="test")]
        llm_service.anthropic_client.messages.create = AsyncMock(return_value=mock_response_anthropic)
        
        validation = await llm_service.validate_api_keys()
        
        assert validation["openai"] is True
        assert validation["anthropic"] is True