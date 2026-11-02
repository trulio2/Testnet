import { type ITranslations } from '@/types'

export const pt: ITranslations = {
  pages: {
    home: {},
    wallet: {
      title: 'Carteira',
      description:
        'Fundos simulados para testes. USD garante BTC/USD e BRL garante USD/BRL.',
      reset: 'Redefinir conta',
      resetConfirm:
        'Redefinir a conta? Os saldos voltam aos valores iniciais, e posições, ordens abertas, execuções e histórico de fundos serão apagados.'
    },
    changelog: {}
  },
  nav: {
    home: 'Início',
    wallet: 'Carteira',
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
      entry: 'Entrada',
      liquidation: 'Liq.'
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
      margin: 'Margem',
      buyingPower: 'Poder de compra',
      leverage: 'Alavancagem',
      leverageRejected:
        'Saldo disponível em {quote} insuficiente para {leverage}x. Adicione fundos ou reduza a posição.',
      buy: 'Comprar / Long',
      sell: 'Vender / Short',
      placed: 'Ordem limite enviada.',
      filled: 'Executado {qty} a {price}.',
      errors: {
        invalidQty: 'Informe uma quantidade válida.',
        invalidPrice: 'Informe um preço válido.',
        belowMinNotional:
          'O valor da ordem deve ser de pelo menos {min} {quote}.',
        insufficientMargin:
          'Saldo disponível em {quote} insuficiente. Adicione fundos na carteira ou aumente a alavancagem.',
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
      addFunds: 'Adicionar fundos'
    },
    walletBalance: {
      usedFor: 'Usado em {symbols}'
    },
    depositForm: {
      title: 'Adicionar fundos',
      currency: 'Moeda',
      amount: 'Valor ({currency})',
      submit: 'Adicionar fundos',
      added: '{amount} {currency} adicionados.',
      invalidAmount: 'Informe um valor entre {min} e {max}.'
    },
    fundsHistory: {
      title: 'Histórico de fundos',
      filter: 'Filtrar por moeda',
      all: 'Todas',
      time: 'Hora (UTC)',
      type: 'Tipo',
      market: 'Mercado',
      currency: 'Moeda',
      amount: 'Valor',
      balance: 'Saldo',
      initial: 'Saldo inicial',
      deposit: 'Depósito',
      trade: 'Negociação',
      liquidation: 'Liquidação',
      lossCovered: 'Perda coberta',
      empty: 'Nenhum lançamento ainda.'
    },
    liquidation: {
      message:
        'Sua posição {side} de {qty} em {symbol} foi liquidada a {price} {quote}. Suas ordens abertas em {quote} foram canceladas.',
      dismiss: 'Dispensar'
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
      liquidationPrice: 'Preço de liq.',
      price: 'Preço',
      time: 'Hora (UTC)',
      liquidity: 'Liquidez',
      fee: 'Taxa',
      unrealizedPnl: 'PnL não realizado',
      realizedPnl: 'PnL realizado',
      long: 'Long',
      short: 'Short',
      buy: 'Compra',
      sell: 'Venda',
      maker: 'Maker',
      taker: 'Taker',
      liquidation: 'Liquidação',
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
