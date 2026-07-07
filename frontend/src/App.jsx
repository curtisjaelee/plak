import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './Home';
import Auth from './Auth';
import AddActivity from './AddActivity';
import ActivityDetail from './ActivityDetail';
import Compare from './Compare';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Auth />} />
        <Route path="/home" element={<Home />} />
        <Route path="/add" element={<AddActivity />} />
        <Route path="/activity/:id" element={<ActivityDetail />} />
        <Route path="/compare/:activityId/:bucket" element={<Compare />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;