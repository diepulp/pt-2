'use client';

import dynamic from 'next/dynamic';
import type React from 'react';
import { useEffect, useState } from 'react';
import 'swagger-ui-react/swagger-ui.css';

// Type definition for SwaggerUI component
interface SwaggerUIProps {
  spec?: object | string;
  url?: string;
}

// Dynamically import Swagger UI to avoid SSR issues
const SwaggerUI = dynamic<SwaggerUIProps>(() => import('swagger-ui-react'), { ssr: false });

export default function ApiDocsPage() {
  const [spec, setSpec] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api-spec.yaml')
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Failed to fetch OpenAPI spec: ${res.statusText}`);
        }
        return res.text();
      })
      .then((yamlText) => {
        // Swagger UI can handle YAML directly
        setSpec(yamlText);
      })
      .catch((err: Error) => {
        console.error('Error loading OpenAPI spec:', err);
        setError(err.message);
      });
  }, []);

  if (error) {
    return (
      <div className="container mx-auto p-8">
        <div className="rounded-md border border-red-500 bg-red-50 p-4 text-red-900">
          <h2 className="mb-2 text-lg font-semibold">Error Loading API Specification</h2>
          <p>{error}</p>
          <p className="mt-4 text-sm">
            Make sure the OpenAPI spec file is available at{' '}
            <code className="rounded bg-red-100 px-1 py-0.5">/public/api-spec.yaml</code>
          </p>
        </div>
      </div>
    );
  }

  if (!spec) {
    return (
      <div className="container mx-auto p-8">
        <div className="flex items-center justify-center">
          <div className="text-center">
            <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" />
            <p className="text-gray-600">Loading API Documentation...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="api-docs-container">
      <SwaggerUI spec={spec} />
    </div>
  );
}
