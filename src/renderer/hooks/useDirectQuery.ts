import { useCallback } from 'react';

// Direct query trigger regex - >>> followed by query
const directQueryRegex = /^\s*>>>(.+)$/;

interface DirectQueryOptions {
  onQueryStart?: () => void;
  onQueryComplete?: (result: any) => void;
  onQueryError?: (error: any) => void;
}

export const useDirectQuery = (options?: DirectQueryOptions) => {
  const handleDirectQuery = useCallback(async (
    query: string,
    lineNumber: number,
    editor: any
  ) => {
    if (!editor || !query) return;
    
    const model = editor.getModel();
    if (!model) return;
    
    // Call onQueryStart if provided
    options?.onQueryStart?.();
    
    try {
      // Send query to backend API without screenshot
      const result = await window.electronAPI.ai.sendCommand({
        action: 'direct_query',
        payload: {
          query: query,
          // No screenshot for >>> trigger
        }
      });
      
      // Replace the trigger line with the result
      let responseText = '';
      if (result.success && result.message) {
        responseText = `\n${result.message}\n`;
      } else {
        responseText = '\n*[AI query failed]*\n';
      }
      
      const range = {
        startLineNumber: lineNumber,
        startColumn: 1,
        endLineNumber: lineNumber,
        endColumn: model.getLineMaxColumn(lineNumber)
      };
      
      editor.executeEdits('direct-query', [{
        range,
        text: responseText
      }]);
      
      // Move cursor to after the inserted content
      const nextLine = lineNumber + responseText.split('\n').length - 1;
      editor.setPosition({ lineNumber: nextLine, column: 1 });
      editor.revealLineInCenterIfOutsideViewport(nextLine);
      
      // Call onQueryComplete if provided
      options?.onQueryComplete?.(result);
      
    } catch (error) {
      console.error('Direct query failed:', error);
      
      // Replace with error message
      const range = {
        startLineNumber: lineNumber,
        startColumn: 1,
        endLineNumber: lineNumber,
        endColumn: model.getLineMaxColumn(lineNumber)
      };
      
      editor.executeEdits('direct-query-error', [{
        range,
        text: `\n*[Query failed: ${error}]*\n`
      }]);
      
      // Call onQueryError if provided
      options?.onQueryError?.(error);
    }
  }, [options]);

  const checkForDirectQuery = useCallback((
    editor: any,
    changes: any
  ): boolean => {
    // Check if Enter key was pressed
    const hasEnter = changes.some((change: any) => 
      change.text.includes('\n')
    );
    
    if (!hasEnter) return false;
    
    const position = editor.getPosition();
    if (!position) return false;
    
    const model = editor.getModel();
    if (!model) return false;
    
    // Check the previous line (before the new line)
    const previousLineNumber = position.lineNumber - 1;
    if (previousLineNumber < 1) return false;
    
    const previousLineContent = model.getLineContent(previousLineNumber);
    
    // Check for >>> direct query trigger
    const directQueryMatch = previousLineContent.match(directQueryRegex);
    if (directQueryMatch) {
      const query = directQueryMatch[1] ? directQueryMatch[1].trim() : '';
      console.log('Direct query detected:', { line: previousLineNumber, query });
      
      if (query.length > 0) {
        // Execute direct query without opening AI window
        handleDirectQuery(query, previousLineNumber, editor);
        return true; // Query was handled
      }
    }
    
    return false; // No query found
  }, [handleDirectQuery]);

  return {
    checkForDirectQuery,
    handleDirectQuery,
    directQueryRegex
  };
};