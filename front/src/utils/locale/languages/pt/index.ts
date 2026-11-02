import { type ITranslations } from '@/types'

export const pt: ITranslations = {
  pages: {
    home: {
      orderPanelTitle: 'Ordem',
      orderPanelNote: 'O envio de ordens chega com a simulação de negociação.'
    },
    changelog: {}
  },
  nav: {
    home: 'Início',
    changelog: 'Changelog'
  },

  components: {
    ticker: {
      symbols: 'Símbolos',
      change: 'Variação 24h',
      high: 'Máxima 24h',
      low: 'Mínima 24h',
      volume: 'Volume 24h'
    },
    connection: {
      connecting: 'Conectando…',
      live: 'Ao vivo',
      reconnecting: 'Reconectando…'
    },
    chart: {
      timeframe: 'Período',
      loading: 'Carregando gráfico',
      feedNote: 'Preços de {feed} na Binance'
    },
    orderBook: {
      title: 'Livro de ofertas',
      price: 'Preço',
      size: 'Qtd.',
      total: 'Total',
      spread: 'Spread'
    },
    recentTrades: {
      title: 'Negócios recentes',
      price: 'Preço',
      size: 'Qtd.',
      time: 'Hora (UTC)'
    }
  },
  error: {
    connectionError: 'Erro de Conexão',
    retry: 'Tentar Novamente',
    goToLogin: 'Ir para Login'
  }
}
