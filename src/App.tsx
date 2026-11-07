import { BrowserRouter, Route, Routes } from 'react-router-dom'
import BanksPage from './components/BanksPage.tsx'
import ClassesPage from './components/ClassesPage.tsx'
import HomePage from './components/HomePage.tsx'
import ImportPage from './components/ImportPage.tsx'
import Layout from './components/Layout.tsx'
import TransactionsPage from './components/TransactionsPage.tsx'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="bancos" element={<BanksPage />} />
          <Route path="classificacoes" element={<ClassesPage />} />
          <Route path="transacoes" element={<TransactionsPage />} />
          <Route path="transacoes/importar" element={<ImportPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
