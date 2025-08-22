import React, { useState, useEffect } from 'react';
import { Settings, Key, Folder, Database, Brain } from 'lucide-react';

interface ConfigField {
  key: string;
  name: string;
  description: string;
  type: 'text' | 'password' | 'directory';
  required: boolean;
  default?: string;
  category: string;
}

interface AppConfig {
  name: string;
  version: string;
  description: string;
  configuration: {
    configurable_keys: ConfigField[];
  };
}

export const SettingsPage: React.FC = () => {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadConfiguration();
  }, []);

  const loadConfiguration = async () => {
    try {
      // Load app configuration schema
      const appConfig = await window.electronAPI.config.getAppConfig();
      setConfig(appConfig);

      // Load current values
      const currentValues = await window.electronAPI.config.getConfigValues();
      setValues(currentValues);
    } catch (error) {
      console.error('Failed to load configuration:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleValueChange = (key: string, value: string) => {
    setValues(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleDirectorySelect = async (key: string) => {
    try {
      const directory = await window.electronAPI.config.selectDirectory();
      if (directory) {
        handleValueChange(key, directory);
      }
    } catch (error) {
      console.error('Failed to select directory:', error);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await window.electronAPI.config.saveConfigValues(values);
      
      // Show success message
      alert('Configuration saved successfully! Please restart the application for changes to take effect.');
    } catch (error) {
      console.error('Failed to save configuration:', error);
      alert('Failed to save configuration. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'AI Services':
        return <Brain className="w-5 h-5" />;
      case 'Additional Services':
        return <Key className="w-5 h-5" />;
      case 'Storage':
        return <Folder className="w-5 h-5" />;
      default:
        return <Settings className="w-5 h-5" />;
    }
  };

  const renderField = (field: ConfigField) => {
    const value = values[field.key] || field.default || '';

    return (
      <div key={field.key} className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          {field.name} {field.required && <span className="text-red-500">*</span>}
        </label>
        <p className="text-xs text-gray-500">{field.description}</p>
        
        <div className="flex space-x-2">
          {field.type === 'directory' ? (
            <>
              <input
                type="text"
                value={value}
                onChange={(e) => handleValueChange(field.key, e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={field.default || `Enter ${field.name.toLowerCase()}`}
              />
              <button
                onClick={() => handleDirectorySelect(field.key)}
                className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
              >
                <Folder className="w-4 h-4" />
              </button>
            </>
          ) : (
            <input
              type={field.type === 'password' ? 'password' : 'text'}
              value={value}
              onChange={(e) => handleValueChange(field.key, e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={field.default || `Enter ${field.name.toLowerCase()}`}
            />
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading configuration...</p>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="p-6 text-center">
        <p className="text-red-600">Failed to load configuration. Please restart the application.</p>
      </div>
    );
  }

  // Group fields by category
  const categorizedFields = config.configuration.configurable_keys.reduce((acc, field) => {
    if (!acc[field.category]) {
      acc[field.category] = [];
    }
    acc[field.category].push(field);
    return acc;
  }, {} as Record<string, ConfigField[]>);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
          <Settings className="w-6 h-6 mr-2" />
          Configuration
        </h1>
        <p className="text-gray-600 mt-1">{config.description}</p>
      </div>

      <div className="space-y-8">
        {Object.entries(categorizedFields).map(([category, fields]) => (
          <div key={category} className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-800 flex items-center mb-4">
              {getCategoryIcon(category)}
              <span className="ml-2">{category}</span>
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {fields.map(renderField)}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 flex justify-end space-x-4">
        <button
          onClick={() => window.close()}
          className="px-6 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Configuration'}
        </button>
      </div>
    </div>
  );
};