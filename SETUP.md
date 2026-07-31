# Setup do perfil (iconboy/iconboy)

Este repositório é o **repo especial de perfil**: o `README.md` dele é o que aparece
em https://github.com/iconboy. O nome do repo tem que ser exatamente `iconboy` e ele
precisa ser **público**.

> **Status (31/07/2026):** os passos 1 a 4 já foram executados — o repo está no ar em
> https://github.com/iconboy/iconboy, o secret `GH_METRICS_TOKEN` está configurado,
> as Actions têm permissão de escrita e os workflows já rodaram com sucesso.
> O secret usa o token OAuth que já estava em `~/.git-credentials`; se um dia ele for
> revogado, os workflows quebram — aí é só gerar um PAT dedicado (passo 2) e
> substituir o secret.

## 1. Criar o repo e subir

```bash
cd /home/developer/www/iconboy
git init -b main
git add .
git commit -m "feat: profile readme"

# com o gh autenticado (gh auth login):
gh repo create iconboy --public --source=. --push

# ou, criando pelo site github.com/new (nome: iconboy, público, sem README):
git remote add origin https://github.com/iconboy/iconboy.git
git push -u origin main
```

## 2. Token para as estatísticas (obrigatório)

O workflow `profile-stats.yml` conta **repositórios privados** também — para isso
precisa de um token pessoal, o `GITHUB_TOKEN` padrão não enxerga isso.

1. https://github.com/settings/tokens → **Generate new token (classic)**
2. Escopos: `repo` e `read:user`. Validade: sem expiração (ou anote pra renovar).
3. No repo: **Settings → Secrets and variables → Actions → New repository secret**
   - Nome: `GH_METRICS_TOKEN`
   - Valor: o token

## 3. Permitir que a Action faça commit

**Settings → Actions → General → Workflow permissions** → marcar
**Read and write permissions** → Save.

Sem isso o passo de commit falha com `403`.

## 4. Rodar a primeira vez

Aba **Actions** → rodar manualmente (`Run workflow`):

| Workflow             | O que faz                                                        |
|----------------------|------------------------------------------------------------------|
| `Profile stats`      | preenche os blocos `terminal`, `languages` e `activity` do README |
| `Contribution snake` | gera a cobrinha na branch `output` (só existe após a 1ª execução) |
| `WakaTime weekly`    | preenche o bloco `waka` (pula sozinho se não tiver a chave)       |

Depois disso tudo roda sozinho todo dia de madrugada.

## 5. WakaTime (opcional)

1. Criar conta em https://wakatime.com → **Settings → API Key**
2. Adicionar o secret `WAKATIME_API_KEY` no repo
3. Instalar o plugin no editor (VS Code: extensão "WakaTime"; PhpStorm: plugin WakaTime)

Enquanto o secret não existir, o workflow só registra um aviso e não falha.

## 6. Sobre os cards do `github-readme-stats`

Os dois cards (`GitHub stats` e `Top languages`) usam a instância pública do
`github-readme-stats`, que **vive caindo por rate limit** (`503`) — em 31/07/2026,
por exemplo, estava fora. Além disso a instância pública **não enxerga repositório
privado**, então o `count_private=true` que está na URL não tem efeito nela.

Os blocos que a nossa própria Action gera (`~/whoami` e `~/languages`) já cobrem
esses números com dados reais, privados incluídos — se os cards estiverem quebrados,
nada essencial se perde.

Para ter os cards estáveis e com repos privados de verdade, dá pra subir sua própria
instância (grátis): https://github.com/anuraghazra/github-readme-stats#deploy-on-your-own
→ deploy na Vercel com a variável `PAT_1` = seu token → trocar
`github-readme-stats.vercel.app` pelo seu domínio nas URLs do README.

> O card de troféus (`github-profile-trophy`) foi removido: o deploy público está
> retornando `402` (sem cota) e não renderiza mais para ninguém.

## 7. Ajustes que talvez você queira

**Mostrar o nome real dos repositórios privados** no bloco `~/now`
(hoje aparece como `private project #1` para não expor nome de cliente):
em `.github/workflows/profile-stats.yml`, mudar `SHOW_PRIVATE_NAMES: "false"` para `"true"`.

**Testar o script local** sem esperar a Action:

```bash
GH_METRICS_TOKEN=ghp_seutoken node scripts/update-readme.mjs
```

**Trocar as cores**: o tema é `#00F5A0` (verde neon) + `#00D9F5` (ciano) sobre
`#0B0F19`. Estão nas URLs dos badges/cards no README — um find & replace resolve.

## Estrutura

```
README.md                              o perfil
scripts/update-readme.mjs              gera os blocos entre os marcadores
.github/workflows/profile-stats.yml    roda o script diariamente e commita
.github/workflows/snake.yml            gera a animação da cobrinha
.github/workflows/wakatime.yml         estatísticas de tempo por linguagem
```

Os blocos automáticos são delimitados por
`<!--START_SECTION:nome-->` … `<!--END_SECTION:nome-->`.
Tudo fora desses marcadores é texto fixo e você pode editar à vontade.
