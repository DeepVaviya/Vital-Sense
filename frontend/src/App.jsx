import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './ThemeContext';
import Landing from './pages/Landing';
import Register from './pages/Register';
import Monitor from './pages/Monitor';
import Analytics from './pages/Analytics';
import Navbar from './components/Navbar';

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Navbar />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/register" element={<Register />} />
          <Route path="/monitor" element={<Monitor />} />
          <Route path="/analytics" element={<Analytics />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
