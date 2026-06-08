import React from 'react';
import ReactDOM from 'react-dom/client';
import TreeBenchmark from './components/TreeBenchmark.js';
import './style.css';

ReactDOM.createRoot(document.getElementById('app')!).render(
  <React.StrictMode>
    <TreeBenchmark />
  </React.StrictMode>
);
