import '@testing-library/jest-dom/vitest';

// Polyfill missing File.prototype.arrayBuffer and text in jsdom test environment
if (typeof File !== 'undefined' && typeof File.prototype.arrayBuffer !== 'function') {
  File.prototype.arrayBuffer = function () {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve(reader.result as ArrayBuffer);
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(this);
    });
  };
}

if (typeof File !== 'undefined' && typeof File.prototype.text !== 'function') {
  File.prototype.text = function () {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve(reader.result as string);
      };
      reader.onerror = reject;
      reader.readAsText(this);
    });
  };
}
