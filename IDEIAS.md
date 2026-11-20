# Ideias para evoluir o conversor

Este arquivo é uma lista de possibilidades, não uma lista de funcionalidades
já implementadas. As ideias estão organizadas por impacto para ajudar a
escolher próximos passos.

## Prioridade alta: precisão e confiança

1. **Configuração de DPI e tamanho de etiqueta**
   - Permitir escolher 203, 300 ou 600 dpi.
   - Oferecer tamanho físico personalizado quando `^PW`/`^LL` não existirem.
   - Mostrar as dimensões calculadas em milímetros e deixar claro quando forem
     estimadas.
   - Usar a mesma configuração em impressão e PDF para evitar diferenças.

2. **Avisos mais úteis do parser**
   - Mostrar comandos ZPL ignorados e a posição aproximada no texto.
   - Distinguir erro que impede a etiqueta de aviso que afeta apenas um
     elemento.
   - Apontar gráficos ausentes, dimensões inconsistentes e recursos ainda não
     suportados sem esconder o restante da prévia.

3. **Suporte incremental a comandos**
   - Adicionar formatos de código de barras além do Code 128.
   - Implementar rotação, orientação, alinhamento e modos de campo.
   - Melhorar suporte a codificação/caracteres e fontes.
   - Investigar `^GF` e outros formatos de imagem ZPL.
   - Para cada novo comando, documentar o subconjunto suportado e criar
     amostras de regressão.

4. **Testes automatizados com etiquetas de referência**
   - Cobrir texto, retângulos, múltiplas etiquetas, códigos de barras,
     gráficos Z64 válidos/inválidos e comandos desconhecidos.
   - Verificar que mudanças no parser não alteram as dimensões e elementos
     convertidos sem intenção.
   - Validar geração de PDF/JPEG e tratamento de canvas/arquivos grandes.

## Prioridade média: facilitar o trabalho com etiquetas

5. **Editor visual de campos**
   - Selecionar texto, caixa ou código de barras na prévia.
   - Alterar posição, tamanho, conteúdo e estilo por controles.
   - Refletir as alterações no ZPL ou oferecer um modelo editável separado.

6. **Gerenciador de etiquetas do documento**
   - Listar etiquetas encontradas, navegar até cada uma, reordenar, duplicar
     ou remover antes de imprimir/exportar.
   - Mostrar contagem e dimensões por etiqueta.

7. **Exportação mais flexível**
   - Permitir JPEG/PNG por etiqueta ou folha única.
   - Oferecer SVG baixável.
   - Configurar qualidade, escala, margens e espaço entre etiquetas.
   - Exportar um ZIP quando cada etiqueta precisar de um arquivo separado.

8. **Impressão assistida**
   - Mostrar prévia do papel personalizado antes de abrir o diálogo.
   - Exibir aviso para conferir tamanho real, escala 100%, margens e DPI do
     driver.
   - Oferecer calibração com régua/etiqueta de teste.
   - Guardar perfis de impressora no navegador.

9. **Edição de dados em lote**
   - Separar um template ZPL dos valores variáveis, como destinatário, SKU,
     endereço e código de rastreio.
   - Importar CSV ou planilha e gerar várias etiquetas substituindo campos.
   - Validar campos obrigatórios antes da conversão.

10. **Importação de vários arquivos**
    - Aceitar múltiplos `.zpl`/`.txt` e compor um documento único.
    - Exibir progresso para arquivos e listas grandes.
    - Permitir salvar/baixar novamente o ZPL original.

## Prioridade futura: escala e experiência

11. **Desempenho em documentos grandes**
    - Renderizar etiquetas sob demanda ou virtualizar a lista.
    - Evitar manter ao mesmo tempo muitos SVGs, canvases e JPEGs na memória.
    - Cancelar conversões/exportações em andamento quando o usuário trocar o
      conteúdo.

12. **Histórico e recuperação**
    - Salvar rascunhos explicitamente no navegador (por exemplo, localStorage)
      com opção de limpar o histórico.
    - Oferecer desfazer/refazer na edição do ZPL.
    - Comparar versões de uma etiqueta.

13. **Acessibilidade e usabilidade**
    - Atalhos para importar, validar, imprimir e exportar.
    - Busca por texto/código nos documentos com várias etiquetas.
    - Mensagens de progresso para conversão de gráficos e exportações longas.
    - Navegação completa por teclado e foco claramente visível.

## Sugestão de ordem

Um caminho seguro seria começar por **DPI/tamanho de etiqueta**, depois
**avisos e testes do parser**, e então ampliar comandos ZPL. Com tamanhos e
renderização confiáveis, ficam mais seguros os recursos de edição, lote e
impressão avançada.
