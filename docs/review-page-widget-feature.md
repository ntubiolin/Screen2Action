# Review Page Widget Feature

## Overview
The Review Page Widget feature enhances the Monaco markdown editor with interactive widget zones above each H1 header. These widgets provide quick access to screenshots, AI chat, and audio playback functionality for each section of the notes.

## Implementation Details

### Components Created

1. **ParagraphWidget** (`src/renderer/components/ParagraphWidget.tsx`)
   - Displays screenshots from the time range of each H1 section
   - Provides three action buttons:
     - Insert Screenshot: Allows selection and insertion of screenshots
     - LLM Chat: Opens AI assistant sidebar with section context
     - Play 15s: Plays 15 seconds of audio from the section's timestamp

2. **ReviewPageWithWidgets** (`src/renderer/pages/ReviewPageWithWidgets.tsx`)
   - Enhanced version of ReviewPage with Monaco widget zones
   - Integrates widget zones above H1 headers
   - Manages AI chat sidebar with MCP server support
   - Handles screenshot insertion into the editor

### Key Features

#### Screenshot Selection
- Screenshots are loaded for the time range of each H1 section
- Users can click to select multiple screenshots
- Selected screenshots show a blue border and check mark
- "Insert Screenshot" button becomes active when screenshots are selected
- Screenshots are inserted at the end of the current section

#### AI Chat Integration
- Opens a sidebar with the current section's content as context
- Supports MCP (Model Context Protocol) server selection
- Falls back to standard AI service if no MCP server is selected
- Displays AI responses in a formatted view
- Maintains conversation context for each section

#### Audio Playback
- Plays audio starting from the section's timestamp
- Automatically stops after 15 seconds
- Uses the mixed audio track from the recording session

### Technical Implementation

#### Monaco Editor Integration
- Uses Monaco's `changeViewZones` API to insert widget areas
- Widgets are positioned above H1 headers (line number - 1)
- Each widget has a height of 180px
- Widgets are recreated when content changes

#### Data Flow
1. Markdown content is parsed to identify H1 headers and timestamps
2. Widget zones are created for each H1 header
3. React components are rendered into the widget DOM nodes
4. User interactions trigger callbacks that modify the editor content

### Styling
- Dark theme consistent with the application design
- Responsive button states (hover, disabled, active)
- Screenshot thumbnails with timestamp overlays
- Smooth transitions and visual feedback

## Usage

To use the new Review Page with widgets:

1. Start a recording session or load an existing session
2. Navigate to the Review page
3. H1 headers in the markdown will automatically show widget areas above them
4. Use the widget buttons to:
   - Select and insert screenshots into the document
   - Start an AI chat about the section
   - Play the audio for that section

## File Structure
```
src/
├── renderer/
│   ├── components/
│   │   └── ParagraphWidget.tsx       # Widget component
│   ├── pages/
│   │   └── ReviewPageWithWidgets.tsx # Enhanced review page
│   └── App.tsx                       # Updated to use new page
```

## Dependencies Added
- `lucide-react`: For consistent icon components

## Future Enhancements
- Add video playback support (currently audio only)
- Implement drag-and-drop for screenshot reordering
- Add more AI quick actions (summarize, translate, etc.)
- Support for other heading levels (H2, H3, etc.)
- Persist widget state between sessions