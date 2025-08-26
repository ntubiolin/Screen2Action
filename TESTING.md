# Screen2Action Test Suite

## Overview
Comprehensive testing infrastructure for both frontend (React/TypeScript) and backend (Python/FastAPI) components.

## Frontend Testing

### Setup
- **Framework**: Jest + React Testing Library
- **Coverage Requirement**: 70% (branches, functions, lines, statements)
- **Test Environment**: jsdom

### Running Frontend Tests
```bash
# Run all tests
npm test

# Run with coverage
npm test:coverage

# Watch mode for development
npm test:watch
```

### Test Structure
```
src/
├── __mocks__/          # Mock files for static assets
├── setupTests.ts       # Global test setup
├── renderer/
│   ├── components/
│   │   └── __tests__/  # Component tests
│   └── store/
│       └── __tests__/  # Store tests
```

### Key Test Files
- `AudioPlayer.test.tsx`: Tests for audio playback component
- `recordingStore.test.ts`: Tests for Zustand state management

## Backend Testing

### Setup
- **Framework**: pytest + pytest-asyncio
- **Coverage Tool**: pytest-cov
- **Test Markers**: unit, integration, e2e, slow

### Running Backend Tests
```bash
cd backend

# Run all tests
uv run pytest

# Run with coverage
uv run pytest --cov=app --cov-report=term-missing

# Run specific test types
uv run pytest -m unit        # Unit tests only
uv run pytest -m integration # Integration tests only
```

### Test Structure
```
backend/
├── pytest.ini          # Pytest configuration
└── tests/
    ├── conftest.py     # Shared fixtures
    ├── unit/           # Unit tests
    └── integration/    # Integration tests
```

### Key Test Files
- `test_websocket_client.py`: WebSocket client functionality
- `test_connection_manager.py`: WebSocket connection management
- `test_llm_service.py`: LLM service with mocked APIs
- `test_api_endpoints.py`: FastAPI endpoint integration tests

## Running All Tests
```bash
# Run both frontend and backend tests
npm run test:all
```

## Continuous Integration
Tests are configured to run automatically on:
- Pull requests
- Push to main branch
- Pre-commit hooks (if configured)

## Test Coverage Reports
- **Frontend**: Coverage reports in `coverage/` directory
- **Backend**: Coverage reports in `backend/htmlcov/` directory

## Refactoring Improvements Made

### AudioPlayer Component
- Extracted `useAudioPlayer` custom hook for better testability
- Added proper TypeScript types and memoization
- Improved accessibility with ARIA labels
- Separated icon components for better organization

### Backend Services
- Added comprehensive mocking for external dependencies
- Implemented proper async testing patterns
- Created reusable fixtures for common test scenarios

## Best Practices
1. Write tests before implementing features (TDD)
2. Keep tests focused and independent
3. Use descriptive test names
4. Mock external dependencies
5. Maintain test coverage above 70%
6. Run tests before committing code

## Troubleshooting

### Common Issues
- **Jest not finding modules**: Check `moduleNameMapper` in jest.config.js
- **Async test timeouts**: Increase timeout or check for unresolved promises
- **Mock not working**: Ensure mocks are properly reset between tests

### Debug Commands
```bash
# Frontend debug
npm test -- --verbose --no-coverage

# Backend debug
uv run pytest -vv --tb=short
```