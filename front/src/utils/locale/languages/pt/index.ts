import { type ITranslations } from '@/types'

export const pt: ITranslations = {
  pages: {
    home: {},
    wallet: {
      title: 'Carteira',
      description:
        'Fundos simulados para testes. USD garante BTC/USD e BRL garante USD/BRL. USD comprado ou vendido no spot de USD/BRL usa este mesmo saldo em USD.',
      reset: 'Redefinir conta',
      resetConfirm:
        'Redefinir a conta? Os saldos voltam aos valores iniciais, e posições, saldos spot, ordens abertas, execuções e histórico de fundos serão apagados.'
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
      liquidation: 'Liq.',
      spot: 'Spot'
    },
    orderForm: {
      title: 'Ordem',
      type: 'Tipo de ordem',
      market: 'Mercado',
      limit: 'Limite',
      size: 'Quantidade ({unit})',
      price: 'Preço ({unit})',
      marketNote: 'Executa agora ao melhor preço disponível.',
      mode: 'Modo',
      spot: 'Spot',
      canSpend: 'Pode gastar ({asset})',
      spotBalance: 'Saldo de {asset}',
      canSell: 'Pode vender ({asset})',
      buySpot: 'Comprar',
      sellSpot: 'Vender',
      orderValue: 'Valor da ordem',
      margin: 'Margem',
      buyingPower: 'Poder de compra',
      fees: 'Taxa maker / taker',
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
        insufficientFunds:
          'Saldo disponível em {quote} insuficiente. Adicione fundos na carteira.',
        insufficientSpotBalance: 'Você só pode vender até {available} {base}.',
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
    indicators: {
      title: 'Indicadores',
      show: 'Mostrar',
      hide: 'Ocultar',
      showAll: 'Mostrar todos',
      hideAll: 'Ocultar todos',
      showList: 'Mostrar lista ({count})',
      hideList: 'Ocultar lista',
      settings: 'Configurar',
      remove: 'Remover',
      defaults: 'Padrão',
      cancel: 'Cancelar',
      ok: 'Ok',
      names: {
        movingAverage: 'Média Móvel',
        ichimoku: 'Nuvem de Ichimoku',
        pivots: 'Pivôs'
      },
      tabs: { inputs: 'Parâmetros', style: 'Estilo' },
      methods: { sma: 'Simples', ema: 'Exponencial', wma: 'Ponderada' },
      sources: {
        close: 'fechamento',
        open: 'abertura',
        high: 'máxima',
        low: 'mínima',
        hl2: 'hl2',
        hlc3: 'hlc3',
        ohlc4: 'ohlc4'
      },
      pivotTypes: {
        traditional: 'Tradicional',
        fibonacci: 'Fibonacci',
        woodie: 'Woodie',
        classic: 'Clássico',
        dm: 'DM',
        camarilla: 'Camarilla'
      },
      pivotTimeframes: {
        auto: 'Automático',
        day: 'Diário',
        week: 'Semanal',
        month: 'Mensal',
        year: 'Anual'
      },
      positions: { left: 'Esquerda', right: 'Direita' },
      fields: {
        method: 'Tipo',
        length: 'Período',
        source: 'Fonte',
        offset: 'Deslocamento',
        color: 'Cor',
        lineWidth: 'Espessura da linha',
        conversionPeriods: 'Períodos da Linha de Conversão',
        basePeriods: 'Períodos da Linha de Base',
        laggingPeriods: 'Períodos do Lagging Span 2',
        displacement: 'Deslocamento',
        conversionLine: 'Linha de Conversão',
        baseLine: 'Linha de Base',
        laggingSpan: 'Lagging Span',
        leadingSpanA: 'Leading Span A',
        leadingSpanB: 'Leading Span B',
        cloudUp: 'Nuvem, span A acima',
        cloudDown: 'Nuvem, span B acima',
        type: 'Tipo',
        pivotsTimeframe: 'Período dos Pivôs',
        pivotsBack: 'Número de Pivôs Anteriores',
        labels: 'Rótulos',
        showLabels: 'Mostrar Rótulos',
        showPrices: 'Mostrar Preços',
        labelsPosition: 'Posição dos Rótulos',
        levels: 'Níveis'
      }
    },
    feeSettings: {
      title: 'Taxas de negociação',
      note: 'Use as taxas de outra plataforma. A taxa taker vale para ordens a mercado, ordens limite que cruzam o livro e liquidações; a taxa maker vale para ordens limite que ficam no livro antes de executar. Uma taxa maker negativa é um rebate. As mudanças valem para execuções futuras, e redefinir a conta as mantém.',
      maker: 'Taxa maker (%)',
      taker: 'Taxa taker (%)',
      save: 'Salvar',
      defaults: 'Padrão',
      saved: 'Taxas de {symbol} salvas.',
      restored: 'Taxas de {symbol} restauradas para o padrão.',
      invalid:
        'A taxa maker deve estar entre {minMaker}% e {max}%, e a taxa taker entre 0% e {max}%.'
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
      spotBuy: 'Compra spot',
      spotSell: 'Venda spot',
      empty: 'Nenhum lançamento ainda.'
    },
    liquidation: {
      message:
        'Sua posição {side} de {qty} em {symbol} foi liquidada a {price} {quote}. Suas ordens abertas em {quote} foram canceladas.',
      dismiss: 'Dispensar'
    },
    simulation: {
      title: 'Enquanto você esteve fora',
      running: 'Verificando o que o mercado fez…',
      checkedUpTo: 'Verificado até {time} UTC',
      failed:
        'Não foi possível carregar os dados de mercado. As negociações continuam pausadas e uma nova tentativa será feita em breve.',
      retry: 'Tentar novamente',
      nothingHappened: 'Nenhuma ordem foi executada e nada foi liquidado.',
      fill: '{market}: {side} de {qty} {base} em {symbol} executada a {price} {quote}.',
      cancelled: 'Ordens abertas canceladas: {count}.',
      estimated:
        'Horário estimado: os dados detalhados de mercado não estão mais disponíveis.',
      close: 'Fechar'
    },
    session: {
      title: 'O Testnet está aberto em outra aba',
      description:
        'Sua conta roda em uma aba por vez. Esta aba assume quando a outra for fechada.'
    },
    spotBalance: {
      title: '{asset} spot',
      boughtOn: 'Comprado em {symbol}',
      available: 'Disponível para venda',
      avgCost: 'Custo médio',
      value: 'Valor',
      unrealizedPnl: 'PnL não realizado'
    },
    ordersPanel: {
      spot: 'Spot',
      spotEmpty: 'Nenhum saldo spot.',
      margin: 'Margem',
      market: 'Mercado',
      balance: 'Saldo',
      available: 'Disponível',
      avgCost: 'Custo médio',
      value: 'Valor',
      sellAll: 'Vender tudo',
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
      spread: 'Spread',
      widenSpread: 'Aumentar spread',
      narrowSpread: 'Diminuir spread'
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
