# Neves Launcher

<p align="center">
  <img src="assets/bannr.png" alt="Neves Launcher" width="960">
</p>

<p align="center">
  <a href="LICENSE"><img alt="Licença: GPL-3.0-or-later" src=""></a>
  <img width="1690" height="1155" alt="image" src="https://github.com/user-attachments/assets/28bb0e18-8510-49aa-a699-a999b3618937" />
</a>

</p>

Um launcher para Windows voltado a projetos de jogos desenvolvidos pela comunidade. Ele lista projetos disponíveis no [VIPortLive](https://viportlive.com), baixa e compila os projetos usando Git e Cargo, e permite executá-los utilizando **os arquivos do jogo que você já possui**.

![Biblioteca do Neves Launcher: versões recomendadas, filtros e visão geral de um projeto]<img width="1690" height="1155" alt="image" src="https://github.com/user-attachments/assets/869b729d-ddaa-4c90-adbb-dcf307f99dd5" />

> **Nenhum jogo está incluído.** O Neves Launcher não acompanha arquivos de jogos, não baixa esses arquivos e não possui vínculo com a Rockstar Games, Take-Two Interactive ou qualquer outra publicadora. Consulte [LEGAL.md](LEGAL.md).

## Origem do projeto

O Neves Launcher é um fork do VILauncher, que originalmente surgiu como um fork do [Mandyhub](https://github.com/TheGameOnAddict/mandyhub-sinkfinger), criado por Zettrox. O projeto original foi redesenhado e ampliado pela equipe VIPortLive. Esta versão está sendo rebatizada como Neves Launcher.

- A biblioteca de projetos não se limita às versões do VIctory. É possível adicionar e gerenciar qualquer projeto Rust com URL do Git, arquivos ZIP pré-compilados para Windows ou builds que já estejam no seu computador.
- O launcher verifica as notas e os relatórios de cada projeto em busca de problemas conhecidos e consegue corrigir e verificar muitos deles (consulte [Recursos](#recursos)).
- Conta com restauração para a versão anterior após uma atualização, gerenciamento de espaço em disco, botão para reportar problemas e uma interface opcional de agente de IA para desenvolvedores.

As configurações e os projetos instalados do Mandyhub são migrados na primeira inicialização, evitando recompilações desnecessárias.

## O que você pode e não pode fazer

**Você pode criar seu próprio fork, e incentivamos isso.** O código está licenciado sob GPL-3.0-or-later. Você pode utilizá-lo, estudá-lo, modificá-lo e redistribuí-lo, inclusive como base para seu próprio launcher ou para contribuir com o projeto. Porém, a licença exige que qualquer cópia ou versão modificada que você distribuir:

- continue licenciada sob GPL-3.0-or-later e disponibilize seu código-fonte;
- mantenha os avisos de direitos autorais, os termos da licença e os créditos aos autores do Mandyhub e do Neves Launcher;
- indique claramente quais alterações foram feitas.

**Você não pode distribuir uma versão de código fechado.** Qualquer versão modificada que você distribuir deverá continuar sob a mesma licença. Essa é uma exigência da GPL, não apenas um pedido dos desenvolvedores.

**Os projetos não são de nossa autoria.** O Neves Launcher gerencia projetos criados por terceiros. Não analisamos, certificamos nem garantimos a segurança do código desses projetos. Verifique o que você está executando.

**Rockstar e GTA.** O Neves Launcher exibe projetos da comunidade para um jogo cujos arquivos você precisa possuir. Ele não inclui, baixa nem distribui arquivos do jogo. A Rockstar Games e a Take-Two Interactive não possuem vínculo com este projeto nem o endossam. Seus nomes e marcas pertencem aos respectivos proprietários.

## Novidades

Novas versões e downloads são publicados em [GitHub Releases](https://github.com/euvictormonte/vicelauncher/releases). O processo de build é executado a cada tag `v*`.

## Download

Baixe o `Neves Launcher.exe` (versão portátil) ou o instalador na página de [Releases](https://github.com/euvictormonte/vicelauncher/releases/latest). O launcher verifica se há atualizações próprias ao iniciar e confere o SHA-256 do executável antes de substituí-lo.

### Alertas de antivírus

Uma versão assinada pode ser verificada com `Get-AuthenticodeSignature` (assinatura: equipe VIPortLive) e com o hash SHA-256 disponível na página da versão. Caso a versão ainda não tenha assinatura, compare o hash SHA-256.

Mesmo assim, mecanismos de análise por aprendizado de máquina, como o Trapmine, podem sinalizar versões recém-compiladas ocasionalmente. Entenda os motivos e saiba como reportar isso em [docs/FALSE-POSITIVES.md](docs/FALSE-POSITIVES.md).

## Recursos

- **Biblioteca.** Reúne projetos do VIPortLive, seus próprios repositórios Git e arquivos ZIP pré-compilados. Cada projeto exibe a taxa de quadros informada, as placas de vídeo para as quais foi desenvolvido e se foi verificado. Projetos removidos do VIPortLive ficam ocultos por padrão, mas podem ser exibidos e abrem a página correspondente no VIPortLive.
- **Avisos de compatibilidade.** O launcher identifica sua placa de vídeo, memória RAM e processador e compara essas informações com os requisitos relatados pelo autor de cada versão. Se uma versão não for compatível com seu computador, um aviso será exibido. Esses dados representam o desempenho observado pelo autor, não requisitos mínimos oficiais. Você também pode definir manualmente a quantidade de RAM e memória de vídeo em *Avançado: especificações do PC*. Não há uma lista de versões recomendadas, pois esses projetos são recentes demais para que seus relatórios possam ser usados em um ranking confiável.
- **Filtros e ordenação.** Organize os projetos por nome, taxa de quadros, estrelas ou data dos commits. Filtre por categoria e placa de vídeo.
- **Configuração de ferramentas.** Detecta Git, Rust e as ferramentas de compilação C++. Caso estejam faltando, pode instalá-las usando winget (o Windows solicitará sua autorização).
- **Instalar, atualizar e jogar.** Depois de baixados e compilados, os projetos ficam armazenados no computador. Durante as atualizações, alterações locais ainda não commitadas são salvas em um arquivo de patch, a versão anterior é mantida para permitir uma restauração com um clique e um aviso é exibido antes do processo.
- **Correção de problemas conhecidos.** Antes de iniciar o jogo, e também pela aba Atividade, o launcher verifica as notas do projeto e a build em busca de problemas conhecidos e corrige o que for possível. Arquivos do Agility SDK são baixados do pacote NuGet da Microsoft e verificados com hashes SHA-256 previamente definidos. Arquivos ausentes são procurados, ferramentas são instaladas, caches são limpos e configurações gráficas são reduzidas após falhas por falta de memória ou erros de perda de dispositivo gráfico. Todas as correções são verificadas novamente após serem aplicadas.
- **Reportar um problema.** Após uma tarefa falhar, um clique abre uma issue no GitHub com o log preenchido. Nomes e caminhos são removidos antes disso. Nenhuma informação é enviada até você clicar em Submit no GitHub.
- **Armazenamento.** As configurações mostram quanto espaço cada projeto ocupa, incluindo fontes, builds, versões anteriores, cache de shaders, saves e perfis. É possível apagar builds anteriores e caches de shaders. Os saves nunca são apagados por essa opção.
- **Saves.** Continue de onde parou, comece um novo save, copie um save de outra versão ou inicie a partir de um checkpoint nomeado. Também é possível importar ou exportar saves em ZIP.
- **Perfis de inicialização e gráficos.** Crie perfis personalizados de argumentos e variáveis de ambiente para cada projeto, além de configurações gráficas específicas.
- **Preparação de shaders.** Compila o cache de shaders antes da primeira inicialização, quando o projeto oferece suporte a esse recurso.
- **Registro de atividades.** Exibe toda a saída do Git e do Cargo, permitindo copiar e exportar os logs. O registro de cada tarefa também é salvo no computador.
- **Acesso por agente de IA (desativado por padrão).** Permite que um agente de IA leia logs e, após sua confirmação, aplique alterações e execute a compilação do projeto. Consulte [Ferramentas para agentes](#ferramentas-para-agentes).
- **Modo de captura de tela.** Oculta nomes, caminhos, notas e logs para facilitar o compartilhamento de imagens.

## Capturas de tela

<img width="1682" height="1157" alt="image" src="https://github.com/user-attachments/assets/8285a4ed-346d-466a-988f-d60584503d32" />



## Requisitos

- Windows 10 ou 11, 64 bits
- WebView2, incluído no Windows 10 e 11 (o instalador fará o download caso necessário)
- Sua própria cópia de qualquer jogo exigido pelo projeto
- Para compilar projetos Rust: Git, Rust e as ferramentas de compilação C++ (o Neves Launcher pode instalá-las)

## Pastas e armazenamento de dados

| Caminho | Conteúdo |
|---|---|
| `%LOCALAPPDATA%\Neves Launcher` | Repositórios, builds, caches de shaders, saves, perfis (`data`), versões anteriores, patches e logs. O local de instalação pode ser alterado nas configurações. |
| `%APPDATA%\Neves Launcher\settings.json` | Arquivo de configurações |

Os saves ficam armazenados em `data` e nunca são modificados durante atualizações, restaurações de versões anteriores ou limpeza de cache.

## Compilando a partir do código-fonte

Requer Node.js 22, pnpm 10 e Rust stable. Durante o desenvolvimento, a interface também pode ser executada em um navegador comum usando um backend simulado.

```powershell
pnpm install
pnpm tauri dev     # inicia o ambiente de desenvolvimento com atualização automática
pnpm tauri build   # gera a versão de lançamento
```

Arquivos gerados:

- `src-tauri\target\release\Neves Launcher.exe`
- `src-tauri\target\release\bundle\nsis\Neves Launcher_<version>_x64-setup.exe`

### Executando as mesmas verificações do CI

```powershell
pnpm ci:check                                  # instalação, verificação de tipos, vite build e testes do Cargo
node scripts/ci.mjs --only typecheck,test      # executa apenas parte das verificações
node scripts/ci.mjs --tauri --keep-going       # também compila o instalador e executa todas as etapas
node scripts/ci.mjs --json                     # também gera .ci/last-run.json
```

Cada etapa exibe PASS ou FAIL, juntamente com o tempo de execução. Quando algo falha, as últimas 40 linhas da saída são mostradas. O código de saída será 0 somente se todas as etapas executadas forem concluídas com sucesso.

O CI executa as mesmas verificações a cada push e pull request. Uma tag `v*` publica uma nova versão.

## Ferramentas para agentes

O script `scripts/neves-launcher-agent.mjs` (executado com `pnpm agent <command>`) permite que um agente de IA consulte os projetos e builds do launcher, leia logs, execute as ferramentas de correção e verificação do próprio launcher e transforme correções em patches para você revisar antes de aplicá-las.

Os comandos de leitura funcionam sempre. Para permitir alterações nos arquivos, é necessário ativar a opção **Acesso do agente de IA** nas configurações do launcher e usar `--yes` no comando.

Execute `pnpm agent help` para consultar os comandos disponíveis e as regras de segurança.

Opcionalmente, o servidor MCP REA (`npx rea-agents@6.10.1 mcp`, MIT, de [morluto/rea](https://github.com/morluto/rea)) oferece ferramentas para agentes de engenharia reversa. A análise nativa exige que você tenha o Hopper, Ghidra, IDA ou Kuna instalado. O REA não é incluído no Neves Launcher.

## Contribuindo

Contribuições são bem-vindas. Leia [CONTRIBUTING.md](CONTRIBUTING.md) antes de abrir um pull request.

Em resumo: abra uma issue para mudanças maiores, execute `pnpm ci:check` e mantenha suas contribuições focadas.

Problemas relacionados a um *projeto* (seu jogo, código ou resultados) devem ser reportados aos respectivos autores. Problemas com a *lista de projetos* devem ser reportados ao VIPortLive. Problemas com o próprio Neves Launcher devem ser reportados neste repositório.

## Estrutura do projeto

| Caminho | Conteúdo |
|---|---|
| `src/` | Interface React (TypeScript, Tailwind CSS) |
| `src/dev/mock.ts` | Backend simulado para o navegador |
| `src-tauri/` | Launcher em Rust (Tauri 2): lista de projetos, tarefas Git e Cargo, saves, perfis, atualizações e diagnósticos |
| `src-tauri/src/brand.rs` | Nomes, links, pastas e fontes da lista de projetos |
| `scripts/` | Verificações de CI (`ci.mjs`) e ferramenta para agentes (`neves-launcher-agent.mjs`) |

A lista de projetos é obtida em `https://viportlive.com/api/launcher`. Caso esse serviço esteja indisponível, o launcher utiliza o arquivo `tracker.json` do PortWatch como alternativa.

## Aviso legal

O Neves Launcher é um gerenciador de projetos. Ele não inclui, baixa nem distribui jogos, builds de jogos ou arquivos de jogos. Você precisa fornecer sua própria cópia de qualquer jogo necessário. Você é responsável pelo que instala, compila e executa, bem como por possuir os direitos necessários para utilizar os arquivos fornecidos.

O software é disponibilizado sem garantia, e o Neves Launcher não possui vínculo com nenhuma publicadora ou desenvolvedora de jogos.

O texto completo está em [LEGAL.md](LEGAL.md). Ele também é exibido na primeira inicialização do aplicativo, que solicita sua aceitação antes de liberar o acesso à biblioteca.

## Créditos

- Fork do Mandyhub, de Zettrox, e dos contribuidores do Mandyhub, por meio de [Mandyhub](https://github.com/TheGameOnAddict/mandyhub-sinkfinger)
- Redesign do launcher por ellion369
- Seletor de saves, checkpoints, perfis e rastreamento de builds por TheGameOnAddict
- VIctory por Marvisak e contribuidores
- Lista de projetos e tracker do PortWatch, disponibilizados pelo VIPortLive
- Fontes Inter e Schibsted Grotesk (SIL Open Font License), Yellowtail (Apache License 2.0), via Fontsource

## Licença

GPL-3.0-or-later. Consulte [LICENSE](LICENSE). Componentes de terceiros mantêm suas próprias licenças.
