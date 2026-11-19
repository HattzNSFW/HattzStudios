import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { configure } from '@testing-library/react';

// The Studio persistence/UI tests exercise real async IndexedDB (fake-indexeddb) plus React
// effects. On a constrained machine (few CPUs / low RAM) the default 1s async util timeout is too
// aggressive and produces flaky "still hydrating" failures. Give async queries more room.
configure({ asyncUtilTimeout: 10_000 });
