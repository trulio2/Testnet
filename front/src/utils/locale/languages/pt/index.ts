import { type ITranslations } from '@/types'

export const pt: ITranslations = {
  pages: {
    home: {},
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
      feedNote: 'Preços de {feed} na Binance',
      buy: 'Compra',
      sell: 'Venda',
      entry: 'Entrada'
    },
    orderForm: {
      title: 'Ordem',
      type: 'Tipo de ordem',
      market: 'Mercado',
      limit: 'Limite',
      size: 'Quantidade ({unit})',
      price: 'Preço ({unit})',
      marketNote: 'Executa agora ao melhor preço disponível.',
      orderValue: 'Valor da ordem',
      buy: 'Comprar / Long',
      sell: 'Vender / Short',
      placed: 'Ordem limite enviada.',
      filled: 'Executado {qty} a {price}.',
      errors: {
        invalidQty: 'Informe uma quantidade válida.',
        invalidPrice: 'Informe um preço válido.',
        belowMinNotional:
          'O valor da ordem deve ser de pelo menos {min} {quote}.',
        insufficientMargin: 'Margem disponível insuficiente.',
        marketUnavailable: 'Dados de mercado indisponíveis no momento.'
      }
    },
    account: {
      title: 'Conta',
      wallet: 'Saldo da carteira',
      unrealizedPnl: 'PnL não realizado',
      equity: 'Patrimônio',
      usedMargin: 'Margem em uso',
      available: 'Disponível',
      reset: 'Redefinir conta',
      resetConfirm:
        'Redefinir a conta? Posições, ordens abertas e execuções serão apagadas.'
    },
    session: {
      title: 'O Testnet está aberto em outra aba',
      description:
        'Sua conta roda em uma aba por vez. Esta aba assume quando a outra for fechada.'
    },
    ordersPanel: {
      positions: 'Posições',
      orders: 'Ordens abertas',
      fills: 'Execuções',
      positionsEmpty: 'Nenhuma posição aberta.',
      ordersEmpty: 'Nenhuma ordem aberta.',
      fillsEmpty: 'Nenhuma execução ainda.',
      symbol: 'Símbolo',
      side: 'Lado',
      size: 'Qtd.',
      entry: 'Entrada',
      mark: 'Marcação',
      price: 'Preço',
      time: 'Hora (UTC)',
      liquidity: 'Liquidez',
      fee: 'Taxa (USD)',
      unrealizedPnl: 'PnL não realizado (USD)',
      realizedPnl: 'PnL realizado (USD)',
      long: 'Long',
      short: 'Short',
      buy: 'Compra',
      sell: 'Venda',
      maker: 'Maker',
      taker: 'Taker',
      close: 'Fechar',
      cancel: 'Cancelar'
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
